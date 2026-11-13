/**
 * Builds a 2D pose from a handful of angles, so templates are easy to write and
 * always have believable proportions.
 *
 * Conventions:
 *  - The figure faces the camera. The subject's LEFT side is on the image's RIGHT.
 *  - Angles are degrees measured from "straight down". Positive means away from
 *    the body's midline (outward) on that side; 90 is horizontal, 180 is straight up.
 *  - Output points are in a unit box (origin top-left, y down). The figure fills
 *    the box height and is centred horizontally.
 */
import type { Point2, PosePoints } from "@/lib/contracts";

export interface PoseSpec {
  /** Whole-torso lean in degrees. Positive leans toward the subject's left. */
  lean?: number;
  /** 0 = facing the camera, 1 = side-on. Narrows shoulders and hips. */
  turn?: number;
  /** Sideways hip shift in torso lengths. Positive is toward the subject's left. */
  hipShift?: number;
  /** Head tilt in degrees. Positive tilts toward the subject's left. */
  headTilt?: number;

  lUpperArm: number;
  lForearm: number;
  rUpperArm: number;
  rForearm: number;

  lThigh: number;
  lShin: number;
  rThigh: number;
  rShin: number;

  /** Foreshortening for limbs pointing at the camera (sitting). 1 = full length. */
  lThighScale?: number;
  rThighScale?: number;
}

/** Bone lengths in torso lengths (shoulder line to hip line = 1). */
const BODY = {
  shoulderHalf: 0.36,
  hipHalf: 0.21,
  upperArm: 0.58,
  forearm: 0.52,
  thigh: 0.86,
  shin: 0.84,
  neckToNose: 0.42,
  headRadius: 0.2,
} as const;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Direction for an angle from straight down; `side` is +1 for the subject's left. */
function dir(angleDeg: number, side: 1 | -1): Point2 {
  const a = rad(angleDeg);
  return [side * Math.sin(a), Math.cos(a)];
}

const add = (p: Point2, d: Point2, len = 1): Point2 => [p[0] + d[0] * len, p[1] + d[1] * len];

export function buildPose(spec: PoseSpec): PosePoints {
  const turn = Math.min(Math.max(spec.turn ?? 0, 0), 1);
  const narrow = 1 - 0.65 * turn;
  const lean = spec.lean ?? 0;

  const hipMid: Point2 = [spec.hipShift ?? 0, 0];
  // "Up" along the torso, rotated by the lean.
  const up: Point2 = [Math.sin(rad(lean)), -Math.cos(rad(lean))];
  const across: Point2 = [Math.cos(rad(lean)), Math.sin(rad(lean))];
  const shoulderMid = add(hipMid, up, 1);

  const lShoulder = add(shoulderMid, across, BODY.shoulderHalf * narrow);
  const rShoulder = add(shoulderMid, across, -BODY.shoulderHalf * narrow);
  const lHip: Point2 = [hipMid[0] + BODY.hipHalf * narrow, hipMid[1]];
  const rHip: Point2 = [hipMid[0] - BODY.hipHalf * narrow, hipMid[1]];

  const lElbow = add(lShoulder, dir(spec.lUpperArm, 1), BODY.upperArm);
  const rElbow = add(rShoulder, dir(spec.rUpperArm, -1), BODY.upperArm);
  const lWrist = add(lElbow, dir(spec.lForearm, 1), BODY.forearm);
  const rWrist = add(rElbow, dir(spec.rForearm, -1), BODY.forearm);

  const lKnee = add(lHip, dir(spec.lThigh, 1), BODY.thigh * (spec.lThighScale ?? 1));
  const rKnee = add(rHip, dir(spec.rThigh, -1), BODY.thigh * (spec.rThighScale ?? 1));
  const lAnkle = add(lKnee, dir(spec.lShin, 1), BODY.shin);
  const rAnkle = add(rKnee, dir(spec.rShin, -1), BODY.shin);

  const headLean = rad(lean + (spec.headTilt ?? 0));
  const nose: Point2 = [
    shoulderMid[0] + Math.sin(headLean) * BODY.neckToNose,
    shoulderMid[1] - Math.cos(headLean) * BODY.neckToNose,
  ];

  const raw: PosePoints = {
    nose,
    lShoulder,
    rShoulder,
    lElbow,
    rElbow,
    lWrist,
    rWrist,
    lHip,
    rHip,
    lKnee,
    rKnee,
    lAnkle,
    rAnkle,
  };
  return fitToUnitBox(raw);
}

/** Scales the figure to fill the unit box's height and centres it horizontally. */
function fitToUnitBox(points: PosePoints): PosePoints {
  const entries = Object.entries(points) as [keyof PosePoints, Point2][];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [name, [x, y]] of entries) {
    const pad = name === "nose" ? BODY.headRadius : 0.04;
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad);
    maxY = Math.max(maxY, y + 0.04);
  }
  const scale = 1 / (maxY - minY);
  const midX = (minX + maxX) / 2;
  const out = {} as PosePoints;
  for (const [name, [x, y]] of entries) {
    out[name] = [round((x - midX) * scale + 0.5), round((y - minY) * scale)];
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Head radius relative to the figure height, for drawing. */
export function headRadiusFor(points: PosePoints): number {
  const shoulderY = (points.lShoulder[1] + points.rShoulder[1]) / 2;
  return Math.max(0.03, (shoulderY - points.nose[1]) * 0.48);
}
