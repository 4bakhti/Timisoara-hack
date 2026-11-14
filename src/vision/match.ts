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
  /** The person's figure height divided by the idea's box height. Above 1 = larger than the idea's figure. */
  sizeRatio: number;
  /** Person's centre minus the box centre, and head line minus the box top, as fractions of the frame. Positive = right / down. */
  dx: number;
  dy: number;
  corrections: Correction[];
}

/** Inside these the framing counts as right: close enough to the idea, never the exact spot. */
const POSITION_TOL = 0.12;
const SIZE_TOL = Math.log(1.3);
/** At these the framing scores zero. */
const POSITION_SPAN = 0.32;
const SIZE_SPAN = Math.log(2.2);
/** The top of the head above the template's top points (eyes, ears), as a share of the figure's height. */
const HEAD_ABOVE_TOP = 0.07;
/** The soles below the ankles, as a share of the figure's height. */
const FEET_BELOW_ANKLES = 0.03;
/** An idea whose box reaches this far down is cut at the bottom of the frame on purpose (upper body, three-quarter). */
const CUT_AT_BOTTOM = 0.95;

/**
 * The box that puts the template's torso onto the live person's torso, same centre
 * and torso length: where the whole target figure stands on this person. The coach
 * draws the target shape there, so it follows the person, and framing reads it to
 * see where their head and feet are. Works with the hips out of sight too.
 */
export function anchoredBox(live: LivePoints, template: PosePoints, aspect: number): Box | null {
  const body = bodyPlacement(toIsotropic(live, aspect));
  if (!body) return null;
  const ref = templatePlacement(template);
  const h = body.torso / ref.torso;
  const centreX = (body.centre[0] - (ref.centre[0] - 0.5) * h) / aspect;
  const w = (0.5 * h) / aspect;
  return { x: centreX - w / 2, y: body.centre[1] - ref.centre[1] * h, w, h };
}

/**
 * Does the person fit the frame the way the idea wants? Close enough is right:
 * within about 12% of the frame and 30% of the size the score stays 100, and
 * the coach asks only for clear changes. The head must be in the frame; the
 * feet too, unless the idea is cut at the bottom (an upper-body or three-quarter
 * shot, sitting at a table), where being closer than the box is also fine.
 *
 * @param live     live points, image-normalised (0–1 in both axes)
 * @param template the pose template for this idea (gives the figure's proportions)
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
  const fit = anchoredBox(live, template, aspect);
  if (!fit) return null;
  const cutAtBottom = box.y + box.h >= CUT_AT_BOTTOM;

  const dx = fit.x + fit.w / 2 - (box.x + box.w / 2);
  const dy = fit.y - box.y;
  const sizeRatio = fit.h / box.h;
  const logSize = Math.log(sizeRatio);

  // Frame edges, as shares of the frame height cut off.
  const headCut = Math.max(0, HEAD_ABOVE_TOP * fit.h - fit.y);
  const feetCut = cutAtBottom ? 0 : Math.max(0, fit.y + (1 + FEET_BELOW_ANKLES) * fit.h - 1);

  const over = (error: number, tol: number, span: number) => Math.min(1, Math.max(0, error - tol) / (span - tol));
  // A cut-off idea only minds a person much smaller than its box; larger is fine while the head is in.
  const sizeOff = over(cutAtBottom ? -logSize : Math.abs(logSize), SIZE_TOL, SIZE_SPAN);
  const xOff = over(Math.abs(dx), POSITION_TOL, POSITION_SPAN);
  // Height in the frame can only be changed by a friend tilting the phone, and only matters at full length.
  const tiltable = mode === "friend" && !cutAtBottom;
  const yOff = tiltable ? over(Math.abs(dy), POSITION_TOL, POSITION_SPAN) : 0;
  const edgeOff = Math.min(1, (headCut + feetCut) / 0.15);
  const score = Math.round(100 * (1 - Math.min(1, 0.45 * sizeOff + 0.35 * xOff + 0.2 * yOff + 0.6 * edgeOff)));

  const corrections: Correction[] = [];
  const cut = headCut > 0 || feetCut > 0;
  const sizeRight = Math.abs(logSize) <= SIZE_TOL || (cutAtBottom && logSize > 0);
  // Cut at an edge while the size is right: the person sits too high or low, and a friend can tilt.
  const tiltFixes = tiltable && sizeRight && cut;
  const tooLarge = !tiltFixes && (cut || (!cutAtBottom && logSize > SIZE_TOL));
  const tooSmall = logSize < -SIZE_TOL;
  if (tooLarge || tooSmall) {
    const id: PhraseId = mode === "solo" ? (tooLarge ? "step_back" : "come_closer") : tooLarge ? "cam_back" : "cam_closer";
    corrections.push({ id, weight: 1.6 + Math.max(edgeOff, sizeOff) });
  }
  if (Math.abs(dx) > POSITION_TOL) {
    // Person too far to image right: pan the phone right, or the person steps to their own right.
    const right = dx > 0;
    const id: PhraseId = mode === "solo" ? (right ? "move_right" : "move_left") : right ? "cam_right" : "cam_left";
    corrections.push({ id, weight: 1.3 + xOff });
  }
  if (tiltable && !tooLarge && (tiltFixes || Math.abs(dy) > POSITION_TOL)) {
    // Person too low in the frame (or feet cut): tilt the phone down. A propped phone cannot be tilted.
    const down = headCut > 0 ? false : feetCut > 0 || dy > 0;
    corrections.push({ id: down ? "cam_down" : "cam_up", weight: 1.2 + Math.max(yOff, edgeOff) });
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
