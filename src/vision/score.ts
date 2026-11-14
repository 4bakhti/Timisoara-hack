/**
 * The shot score: one explainable number for a photo against the chosen idea.
 * The same function scores the "before" photo and the final one, so the two
 * numbers can be compared.
 *
 * Parts: framing (is the person where the idea wants them), pose (does it match
 * the template), crop (no limb cut at a joint), light (the face is not much
 * darker than the rest), level (the phone was held straight).
 */
import type { Box, CoachMode, PosePointName, PosePoints, ShotIdea, ShotScore } from "@/lib/contracts";
import { poseFeatures, toIsotropic, torsoFrame } from "./geometry";
import { matchFraming, matchPose } from "./match";
import { getPoseTemplate } from "./poses/catalog";
import { createStillTracker, hasTorso, type StillTracker, type TrackedPose } from "./tracker";

const WEIGHTS = { pose: 0.4, framing: 0.3, crop: 0.1, light: 0.1, level: 0.1 } as const;

/** Joint → the joint nearer the body. A limb is "cut" when the frame ends between them. */
const LIMB_ENDS: [PosePointName, PosePointName][] = [
  ["lWrist", "lElbow"],
  ["rWrist", "rElbow"],
  ["lElbow", "lShoulder"],
  ["rElbow", "rShoulder"],
  ["lAnkle", "lKnee"],
  ["rAnkle", "rKnee"],
  ["lKnee", "lHip"],
  ["rKnee", "rHip"],
];

const EDGE = 0.035;
const inside = (p: [number, number]) => p[0] > EDGE && p[0] < 1 - EDGE && p[1] > EDGE && p[1] < 1 - EDGE;
const wellInside = (p: [number, number]) => p[0] > 0.02 && p[0] < 0.98 && p[1] > 0.02 && p[1] < 0.98;

/** 100 when no limb is cut at or near a joint; 30 points off per cut. */
export function cropScore(pose: TrackedPose): number {
  let cuts = 0;
  for (const [end, parent] of LIMB_ENDS) {
    // The joint sits on the frame edge (or just outside) while the limb leading to it is in view.
    if (wellInside(pose.all[parent]) && !inside(pose.all[end]) && pose.visibility[parent] >= 0.5) {
      const d = Math.min(pose.all[end][0], 1 - pose.all[end][0], pose.all[end][1], 1 - pose.all[end][1]);
      if (d > -0.08) cuts += 1;
    }
  }
  return Math.max(0, 100 - 30 * cuts);
}

type Drawable = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

/** Compares the brightness of the face with the whole picture. null without a face. */
export function lightScore(image: Drawable, pose: TrackedPose): number | null {
  const nose = pose.points.nose;
  const frame = torsoFrame(pose.points);
  if (!nose || !frame || typeof document === "undefined") return null;
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const half = Math.max(3, Math.round(Math.abs(frame.shoulderMid[1] - nose[1]) * 0.6 * size));
    const cx = Math.round(nose[0] * size);
    const cy = Math.round(nose[1] * size);
    let face = 0;
    let faceCount = 0;
    let all = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        all += lum;
        if (Math.abs(x - cx) <= half && Math.abs(y - cy) <= half) {
          face += lum;
          faceCount += 1;
        }
      }
    }
    if (!faceCount) return null;
    const faceMean = face / faceCount;
    const allMean = all / (size * size) || 1;
    const ratio = faceMean / allMean;
    // A face at 80% of the picture's brightness or more is fine (100);
    // at 40% or less it is badly backlit (20). Linear in between.
    const t = Math.min(1, Math.max(0, (ratio - 0.4) / 0.4));
    let score = 20 + 80 * t;
    if (faceMean < 40) score = Math.min(score, 50);
    return Math.round(score);
  } catch {
    return null; // Cross-origin image: pixels cannot be read.
  }
}

export interface ScoreInput {
  pose: TrackedPose | null;
  idea: ShotIdea;
  mode: CoachMode;
  /** Image width / height. */
  aspect: number;
  /** Phone roll score 0–100, or null when unknown. */
  level: number | null;
  /** The picture itself, for the light check. Optional. */
  image?: Drawable;
  /** Score against a target taken from an AI preview instead of the idea's template and box. */
  target?: { points: PosePoints; box: Box };
}

export function computeShotScore(input: ScoreInput): ShotScore {
  const { pose, idea, mode, aspect } = input;
  const template = input.target ? { points: input.target.points } : getPoseTemplate(idea.subject?.poseTemplateId);
  const box = input.target?.box ?? idea.framing.subjectBox;
  const person = pose && hasTorso(pose.points) ? pose : null;

  // Without a subject the tracker has nothing to measure framing against: report it as not measured.
  const framing = !idea.subject
    ? null
    : person
      ? (matchFraming(person.points, template.points, box, aspect, mode)?.score ?? 0)
      : 0;

  let poseScore: number | null = null;
  if (idea.subject && person) {
    const live = poseFeatures(toIsotropic(person.points, aspect));
    const target = poseFeatures(template.points);
    poseScore = live && target ? matchPose(live, target).score : null;
  } else if (idea.subject) {
    poseScore = 0;
  }

  const parts = {
    pose: poseScore,
    framing,
    crop: idea.subject && person ? cropScore(person) : null,
    light: idea.subject && person && input.image ? lightScore(input.image, person) : null,
    level: input.level,
  };

  let total = 0;
  let weights = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const value = parts[key];
    if (value === null) continue;
    total += WEIGHTS[key] * value;
    weights += WEIGHTS[key];
  }
  return { total: Math.round(weights ? total / weights : 0), ...parts };
}

let stillTracker: Promise<StillTracker> | null = null;

/** The shared tracker for single photos. Loaded on first use. */
export function getStillTracker(): Promise<StillTracker> {
  stillTracker ??= createStillTracker({ withMask: true });
  return stillTracker;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

/**
 * Scores a photo (data URL, blob URL or address) against an idea. Use it for the
 * "before" picture so it can be compared with the captured shot's score.
 * Level is unknown for a still, so it is left out of both the parts and the total.
 * Returns null when nothing could be measured (an idea without a person), so the
 * interface shows "not measured" instead of a misleading 0.
 */
export async function scoreStill(
  src: string,
  idea: ShotIdea,
  mode: CoachMode = "friend",
  target?: { points: PosePoints; box: Box },
): Promise<ShotScore | null> {
  const image = await loadImage(src);
  const tracker = await getStillTracker();
  const pose = tracker.detect(image);
  const score = computeShotScore({
    pose,
    idea,
    mode,
    aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
    level: null,
    image,
    target,
  });
  return isMeasured(score) ? score : null;
}

/** true when at least one part of the score could be measured. */
export function isMeasured(score: ShotScore): boolean {
  return [score.pose, score.framing, score.crop, score.light, score.level].some((part) => part !== null);
}
