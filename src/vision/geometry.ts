/**
 * Pose geometry: turning body points into a small set of angles that describe a
 * pose regardless of where the person stands or how far away they are.
 *
 * All functions are pure. Points are in "isotropic" coordinates, meaning one unit
 * is the same distance horizontally and vertically (see `toIsotropic`).
 * Sides are always the person's own left and right; a person facing the camera
 * has their left side on the image's right.
 */
import type { Point2, PosePointName, PosePoints } from "@/lib/contracts";
import type { WorldPoints } from "./types";

export type LivePoints = Partial<Record<PosePointName, Point2>>;

/** The angles (degrees) and ratios that make up a pose. Missing = not visible. */
export interface PoseFeatures {
  /** Torso lean from vertical. Positive = toward the person's left. */
  lean?: number;
  /** Head tilt relative to the torso. Positive = toward the person's left. */
  headTilt?: number;
  /** Shoulder width divided by torso length. Smaller = turned away from the camera. */
  turn?: number;
  /** Limb directions measured from "down along the torso". Positive = away from the body. */
  lUpperArm?: number;
  rUpperArm?: number;
  lForearm?: number;
  rForearm?: number;
  lThigh?: number;
  rThigh?: number;
  lShin?: number;
  rShin?: number;
}

export type FeatureName = keyof PoseFeatures;

const deg = (rad: number) => (rad * 180) / Math.PI;

export const sub = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
export const mid = (a: Point2, b: Point2): Point2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const dist = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dot = (a: Point2, b: Point2) => a[0] * b[0] + a[1] * b[1];

/** Smallest signed difference a − b between two angles, in (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Converts image-normalised points (0–1 in both axes) to isotropic coordinates,
 * using the image's width / height. Heights stay 0–1; widths are scaled.
 */
export function toIsotropic(points: LivePoints, aspect: number): LivePoints {
  const out: LivePoints = {};
  for (const name of Object.keys(points) as PosePointName[]) {
    const p = points[name];
    if (p) out[name] = [p[0] * aspect, p[1]];
  }
  return out;
}

export interface TorsoFrame {
  shoulderMid: Point2;
  hipMid: Point2;
  /** Unit vector from the shoulders toward the hips. */
  down: Point2;
  /** Unit vector toward the person's left, perpendicular to `down`. */
  left: Point2;
  /** Shoulder line to hip line distance. */
  length: number;
  /** Midpoint between shoulder line and hip line. */
  centre: Point2;
}

/** The torso's position and axes, or null when shoulders or hips are not visible. */
export function torsoFrame(p: LivePoints): TorsoFrame | null {
  const { lShoulder, rShoulder, lHip, rHip } = p;
  if (!lShoulder || !rShoulder || !lHip || !rHip) return null;
  const shoulderMid = mid(lShoulder, rShoulder);
  const hipMid = mid(lHip, rHip);
  const length = dist(shoulderMid, hipMid);
  if (length < 1e-6) return null;
  const down: Point2 = [(hipMid[0] - shoulderMid[0]) / length, (hipMid[1] - shoulderMid[1]) / length];
  // Perpendicular to `down`, chosen to point from the right shoulder to the left shoulder.
  let left: Point2 = [down[1], -down[0]];
  if (dot(left, sub(lShoulder, rShoulder)) < 0) left = [-left[0], -left[1]];
  return { shoulderMid, hipMid, down, left, length, centre: mid(shoulderMid, hipMid) };
}

/** Direction of the bone a→b relative to the torso: 0 = down, positive = outward. */
function limbAngle(frame: TorsoFrame, a: Point2 | undefined, b: Point2 | undefined, side: 1 | -1): number | undefined {
  if (!a || !b) return undefined;
  const v = sub(b, a);
  if (Math.hypot(v[0], v[1]) < 1e-6) return undefined;
  return deg(Math.atan2(dot(v, frame.left) * side, dot(v, frame.down)));
}

/** Describes a pose as angles. Works for a template and for live points alike. */
export function poseFeatures(p: LivePoints): PoseFeatures | null {
  const frame = torsoFrame(p);
  if (!frame) return null;
  const features: PoseFeatures = {};

  // Lean: torso "up" against image "up". 0 = upright; positive when the shoulders
  // sit toward image right, which is the person's left when they face the camera.
  features.lean = deg(Math.atan2(-frame.down[0], frame.down[1]));

  if (p.lShoulder && p.rShoulder) features.turn = dist(p.lShoulder, p.rShoulder) / frame.length;

  if (p.nose) {
    const v = sub(p.nose, frame.shoulderMid);
    features.headTilt = deg(Math.atan2(dot(v, frame.left), -dot(v, frame.down)));
  }

  features.lUpperArm = limbAngle(frame, p.lShoulder, p.lElbow, 1);
  features.rUpperArm = limbAngle(frame, p.rShoulder, p.rElbow, -1);
  features.lForearm = limbAngle(frame, p.lElbow, p.lWrist, 1);
  features.rForearm = limbAngle(frame, p.rElbow, p.rWrist, -1);
  features.lThigh = limbAngle(frame, p.lHip, p.lKnee, 1);
  features.rThigh = limbAngle(frame, p.rHip, p.rKnee, -1);
  features.lShin = limbAngle(frame, p.lKnee, p.lAnkle, 1);
  features.rShin = limbAngle(frame, p.rKnee, p.rAnkle, -1);

  for (const key of Object.keys(features) as FeatureName[]) {
    if (features[key] === undefined || Number.isNaN(features[key])) delete features[key];
  }
  return features;
}

/** The same pose with left and right swapped. */
export function mirrorFeatures(f: PoseFeatures): PoseFeatures {
  const flip = (v: number | undefined) => (v === undefined ? undefined : -v);
  const out: PoseFeatures = {
    lean: flip(f.lean),
    headTilt: flip(f.headTilt),
    turn: f.turn,
    lUpperArm: f.rUpperArm,
    rUpperArm: f.lUpperArm,
    lForearm: f.rForearm,
    rForearm: f.lForearm,
    lThigh: f.rThigh,
    rThigh: f.lThigh,
    lShin: f.rShin,
    rShin: f.lShin,
  };
  for (const key of Object.keys(out) as FeatureName[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** Interior angle of a joint from its two bone directions. 180 = straight. */
export function jointBend(upper: number | undefined, lower: number | undefined): number | undefined {
  if (upper === undefined || lower === undefined) return undefined;
  return 180 - Math.abs(angleDiff(lower, upper));
}

/** Where the torso sits and how large it is, for framing checks. */
export interface BodyPlacement {
  /** Torso centre in the same coordinates as the input points. */
  centre: Point2;
  /** Torso length in the same units. */
  torso: number;
}

export function bodyPlacement(p: LivePoints): BodyPlacement | null {
  const frame = torsoFrame(p);
  return frame ? { centre: frame.centre, torso: frame.length } : null;
}

/**
 * Places a template inside a target box and returns image-normalised points:
 * exactly where the person's joints would be if they matched the idea perfectly.
 */
export function templateToImage(
  points: PosePoints,
  box: { x: number; y: number; w: number; h: number },
  aspect: number,
): PosePoints {
  const out = {} as PosePoints;
  for (const name of Object.keys(points) as PosePointName[]) {
    const [x, y] = points[name];
    out[name] = [box.x + box.w / 2 + ((x - 0.5) * box.h) / aspect, box.y + y * box.h];
  }
  return out;
}

/** Template helpers: the fraction of the figure's height taken by the torso, and where it sits. */
export function templatePlacement(points: PosePoints): BodyPlacement {
  // Template points are already isotropic with the figure filling a unit of height.
  return bodyPlacement(points)!;
}

/**
 * Body turn and forward lean from 3D points: what a flat picture cannot show.
 * TO BUILD (Person C): yaw from the shoulder line's depth (0 = facing the camera,
 * positive = turned toward the person's left), lean from the hips→shoulders
 * direction (0 = upright, positive = leaning toward the camera).
 */
export function bodyAngles3d(world: WorldPoints | undefined): { yawDeg: number | null; leanDeg: number | null } {
  void world;
  return { yawDeg: null, leanDeg: null };
}
