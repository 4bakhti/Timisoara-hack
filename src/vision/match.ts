/**
 * Compares a live body with a target: how close the pose is, how well the person
 * is placed in the frame, and which single correction would help most.
 *
 * Pure functions, no browser APIs. Corrections are returned as phrase ids from
 * src/coach/phrases.ts; "left" and "right" are the person's own.
 */
import type { Box, CoachMode, PosePoints } from "@/lib/contracts";
import type { PhraseId } from "@/coach/phrases";
import { poseDepthTarget } from "./poses/build";
import type { WorldPoints } from "./types";
import {
  angleDiff,
  bodyAngles3d,
  bodyPlacement,
  jointBend,
  mirrorFeatures,
  poseFeatures,
  templatePlacement,
  toIsotropic,
  type FeatureName,
  type LivePoints,
  type PoseFeatures,
} from "./geometry";

/** A possible correction. `weight` says how much it matters; the largest wins. */
export interface Correction {
  id: PhraseId;
  weight: number;
}

export interface PoseMatch {
  /** 0–100. */
  score: number;
  /** true when the person is doing the mirror image of the template (also accepted). */
  mirrored: boolean;
  corrections: Correction[];
  /** How many pose features could be compared. */
  compared: number;
}

interface FeatureRule {
  /** Degrees (or ratio for "turn") inside which the feature counts as matched. */
  tol: number;
  /** Error beyond tolerance at which the feature scores zero. */
  span: number;
  weight: number;
}

const RULES: Record<FeatureName, FeatureRule> = {
  lUpperArm: { tol: 14, span: 55, weight: 1 },
  rUpperArm: { tol: 14, span: 55, weight: 1 },
  lForearm: { tol: 20, span: 65, weight: 0.9 },
  rForearm: { tol: 20, span: 65, weight: 0.9 },
  lThigh: { tol: 12, span: 40, weight: 0.55 },
  rThigh: { tol: 12, span: 40, weight: 0.55 },
  lShin: { tol: 15, span: 45, weight: 0.45 },
  rShin: { tol: 15, span: 45, weight: 0.45 },
  lean: { tol: 6, span: 22, weight: 0.7 },
  headTilt: { tol: 11, span: 30, weight: 0.3 },
  turn: { tol: 0.14, span: 0.4, weight: 0.5 },
  turnDeg: { tol: 12, span: 40, weight: 0.7 },
  forwardLean: { tol: 7, span: 24, weight: 0.7 },
};

const FEATURES = Object.keys(RULES) as FeatureName[];

/**
 * Forward lean from 3D points is measured (the lab readout shows it) but not
 * judged yet. People standing upright and facing the camera read 8–17° toward
 * the camera, and the reading moves with the phone's tilt, so with a 7°
 * tolerance the coach would tell people who stand straight to straighten up.
 * Turn this on once the reading is calibrated on phones.
 */
export const JUDGE_FORWARD_LEAN = false;

function featureError(name: FeatureName, live: number, target: number): number {
  return name === "turn" ? live - target : angleDiff(live, target);
}

function similarity(rule: FeatureRule, error: number): number {
  const over = Math.abs(error) - rule.tol;
  return over <= 0 ? 1 : Math.max(0, 1 - over / rule.span);
}

function scoreAgainst(live: PoseFeatures, target: PoseFeatures): { score: number; compared: number } {
  let total = 0;
  let weights = 0;
  let compared = 0;
  for (const name of FEATURES) {
    const l = live[name];
    const t = target[name];
    if (l === undefined || t === undefined) continue;
    const rule = RULES[name];
    total += rule.weight * similarity(rule, featureError(name, l, t));
    weights += rule.weight;
    compared += 1;
  }
  return { score: weights ? (100 * total) / weights : 0, compared };
}

/** Compares live pose features with a template's, accepting the mirror image too. */
export function matchPose(live: PoseFeatures, template: PoseFeatures): PoseMatch {
  const direct = scoreAgainst(live, template);
  const flippedTarget = mirrorFeatures(template);
  const flipped = scoreAgainst(live, flippedTarget);
  // Prefer the pose as written unless its mirror image is clearly what the person is doing.
  const mirrored = flipped.score > direct.score + 6;
  const target = mirrored ? flippedTarget : template;
  const best = mirrored ? flipped : direct;
  return {
    score: Math.round(best.score),
    mirrored,
    compared: best.compared,
    corrections: poseCorrections(live, target),
  };
}

function poseCorrections(live: PoseFeatures, target: PoseFeatures): Correction[] {
  const out: Correction[] = [];
  const push = (id: PhraseId, name: FeatureName, error: number) => {
    const rule = RULES[name];
    const over = Math.abs(error) - rule.tol;
    if (over > 0) out.push({ id, weight: rule.weight * Math.min(1, over / rule.span) });
  };

  for (const side of ["left", "right"] as const) {
    const s = side === "left" ? "l" : "r";
    const upperName = `${s}UpperArm` as FeatureName;
    const foreName = `${s}Forearm` as FeatureName;
    const upperLive = live[upperName];
    const upperTarget = target[upperName];
    if (upperLive !== undefined && upperTarget !== undefined) {
      const error = angleDiff(upperLive, upperTarget);
      push(error < 0 ? (`raise_${side}_arm` as PhraseId) : (`lower_${side}_arm` as PhraseId), upperName, error);
    }

    const foreLive = live[foreName];
    const foreTarget = target[foreName];
    if (foreLive !== undefined && foreTarget !== undefined) {
      const bendLive = jointBend(upperLive, foreLive);
      const bendTarget = jointBend(upperTarget, foreTarget);
      const dirError = angleDiff(foreLive, foreTarget);
      if (bendLive !== undefined && bendTarget !== undefined && Math.abs(bendLive - bendTarget) > RULES[foreName].tol) {
        // The elbow is too straight or too bent.
        const bendError = bendLive - bendTarget;
        push(bendError > 0 ? (`bend_${side}_elbow` as PhraseId) : (`straighten_${side}_arm` as PhraseId), foreName, bendError);
      } else {
        // The bend is right but the forearm points the wrong way: in toward the body, or out.
        push(dirError > 0 ? (`hand_in_${side}` as PhraseId) : (`hand_out_${side}` as PhraseId), foreName, dirError);
      }
    }

    const thighName = `${s}Thigh` as FeatureName;
    const shinName = `${s}Shin` as FeatureName;
    const kneeLive = jointBend(live[thighName], live[shinName]);
    const kneeTarget = jointBend(target[thighName], target[shinName]);
    if (kneeLive !== undefined && kneeTarget !== undefined) {
      const bendError = kneeLive - kneeTarget;
      push(bendError > 0 ? (`bend_${side}_knee` as PhraseId) : (`straighten_${side}_leg` as PhraseId), shinName, bendError);
    }
  }

  if (live.lean !== undefined && target.lean !== undefined) {
    const error = angleDiff(live.lean, target.lean);
    const upright = Math.abs(target.lean) < RULES.lean.tol;
    const id: PhraseId = upright ? "stand_straight" : error < 0 ? "lean_left" : "lean_right";
    push(id, "lean", error);
  }

  if (live.turn !== undefined && target.turn !== undefined) {
    const error = live.turn - target.turn;
    push(error > 0 ? "turn_side" : "face_camera", "turn", error);
  }

  if (live.turnDeg !== undefined && target.turnDeg !== undefined) {
    const error = live.turnDeg - target.turnDeg;
    push(error < 0 ? "turn_side" : "face_camera", "turnDeg", error);
  }

  if (live.forwardLean !== undefined && target.forwardLean !== undefined) {
    const error = angleDiff(live.forwardLean, target.forwardLean);
    push(error < 0 ? "lean_forward" : "straighten_up", "forwardLean", error);
  }

  if (live.headTilt !== undefined && target.headTilt !== undefined) {
    const error = angleDiff(live.headTilt, target.headTilt);
    push(error < 0 ? "tilt_head_left" : "tilt_head_right", "headTilt", error);
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/* ------------------------------------------------------------------ framing */

export interface FramingMatch {
  /** 0–100. */
  score: number;
  /** Live size divided by wanted size. Above 1 = the person is too large in the frame. */
  sizeRatio: number;
  /** Offset of the person from where they should be, as fractions of the frame. Positive = right / down. */
  dx: number;
  dy: number;
  corrections: Correction[];
}

const POSITION_TOL = 0.07;
const SIZE_TOL = 0.16;

/**
 * Compares where the person is with where the idea wants them.
 *
 * @param live     live points, image-normalised (0–1 in both axes)
 * @param template the pose template for this idea (gives the expected torso size and place)
 * @param box      idea.framing.subjectBox, image-normalised
 * @param aspect   image width / height
 * @param mode     decides who is told to move: the photographer (friend) or the person (solo)
 */
export function matchFraming(
  live: LivePoints,
  template: PosePoints,
  box: Box,
  aspect: number,
  mode: CoachMode,
): FramingMatch | null {
  const body = bodyPlacement(toIsotropic(live, aspect));
  if (!body) return null;
  const ref = templatePlacement(template);

  // Expected torso length and centre, in isotropic coordinates (heights are 0–1).
  const wantTorso = ref.torso * box.h;
  const wantX = (box.x + box.w / 2) * aspect + (ref.centre[0] - 0.5) * box.h;
  const wantY = box.y + ref.centre[1] * box.h;

  const sizeRatio = body.torso / wantTorso;
  const dx = (body.centre[0] - wantX) / aspect;
  const dy = body.centre[1] - wantY;

  const positionError = Math.min(1, Math.hypot(dx, dy) / 0.3);
  const sizeError = Math.min(1, Math.abs(Math.log(sizeRatio)) / Math.log(1.7));
  const score = Math.round(100 * (1 - Math.min(1, 0.6 * positionError + 0.4 * sizeError)));

  const corrections: Correction[] = [];
  const sizeOver = Math.abs(sizeRatio - 1) - SIZE_TOL;
  if (sizeOver > 0) {
    const tooLarge = sizeRatio > 1;
    const id: PhraseId = mode === "solo" ? (tooLarge ? "step_back" : "come_closer") : tooLarge ? "cam_back" : "cam_closer";
    corrections.push({ id, weight: 1.6 + Math.min(1, sizeOver / 0.5) });
  }
  const xOver = Math.abs(dx) - POSITION_TOL;
  if (xOver > 0) {
    // Person too far to image right: pan the phone right, or the person steps to their own right.
    const right = dx > 0;
    const id: PhraseId = mode === "solo" ? (right ? "move_right" : "move_left") : right ? "cam_right" : "cam_left";
    corrections.push({ id, weight: 1.3 + Math.min(1, xOver / 0.3) });
  }
  const yOver = Math.abs(dy) - POSITION_TOL;
  if (yOver > 0 && mode === "friend") {
    // Person too low in the frame: tilt the phone down. A propped phone cannot be tilted.
    corrections.push({ id: dy > 0 ? "cam_down" : "cam_up", weight: 1.2 + Math.min(1, yOver / 0.3) });
  }
  corrections.sort((a, b) => b.weight - a.weight);
  return { score, sizeRatio, dx, dy, corrections };
}

/** One call for the common case: live points against a template and a target box. */
export function matchAll(
  live: LivePoints,
  template: PosePoints,
  box: Box,
  aspect: number,
  mode: CoachMode,
  /** Live 3D points for matching catalog templates with depth targets. */
  world?: WorldPoints,
): { pose: PoseMatch | null; framing: FramingMatch | null } {
  const liveFeatures = poseFeatures(toIsotropic(live, aspect));
  const templateFeatures = poseFeatures(template);
  const depthTarget = world && poseDepthTarget(template);
  if (depthTarget && liveFeatures && templateFeatures) {
    const { yawDeg, leanDeg } = bodyAngles3d(world);
    if (yawDeg !== null) {
      delete liveFeatures.turn;
      liveFeatures.turnDeg = Math.abs(yawDeg);
      templateFeatures.turnDeg = depthTarget.turnDeg;
    }
    if (JUDGE_FORWARD_LEAN && leanDeg !== null) {
      liveFeatures.forwardLean = leanDeg;
      templateFeatures.forwardLean = depthTarget.forwardLean;
    }
  }
  return {
    pose: liveFeatures && templateFeatures ? matchPose(liveFeatures, templateFeatures) : null,
    framing: matchFraming(live, template, box, aspect, mode),
  };
}
