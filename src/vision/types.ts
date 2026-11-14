/**
 * Shared shapes for the vision upgrades (Sat 14 Nov): 3D body points, the
 * person's silhouette, face signals and targets taken from AI pose previews.
 *
 * Every one of them is optional wherever it is used. When a phone or a model
 * cannot provide it, the coach behaves exactly as it did before.
 */
import type { Box, PosePointName, PosePoints } from "@/lib/contracts";

export type Point3 = [number, number, number];

/**
 * MediaPipe "world" landmarks: real 3D positions in metres with the origin
 * between the hips. Check the axis directions in the MediaPipe Pose docs before
 * relying on a sign.
 */
export type WorldPoints = Partial<Record<PosePointName, Point3>>;

/**
 * A low-resolution mask of where the person is. `alpha` holds width × height
 * values (0 = background, 255 = person), row by row, in image orientation (not
 * mirrored). Keep it small (about 128–256 px on the long side) so it is cheap
 * to make and to draw every few frames.
 */
export interface SilhouetteMask {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}

/** What the face tells us. A field is null when it could not be measured. */
export interface FaceSignals {
  /** 0–1: 1 = both eyes wide open. Use the lower of the two eyes. */
  eyesOpen: number | null;
  /** 0–1: 1 = a broad smile. */
  smile: number | null;
  /** Head turned, in degrees. 0 = facing the camera; positive = toward the person's left. */
  yawDeg: number | null;
  /** Head tilted up or down, in degrees. 0 = level; positive = chin up. */
  pitchDeg: number | null;
}

export type PoseModelName = "lite" | "full";

/**
 * A coaching target taken from a picture, normally an AI pose preview made from
 * the user's own scene. Replaces the pose template and the planner's target box.
 */
export interface CustomTarget {
  /** The pose in the same unit-box format as the templates (figure fills the box height). */
  points: PosePoints;
  /** Where the person should stand, in normalised image coordinates. */
  box: Box;
  /** The person's outline in the preview, drawn as the dashed target silhouette. */
  silhouette?: SilhouetteMask;
  /** 3D points of the target pose, when the model gave them. */
  world?: WorldPoints;
}

/** Body parts, for drawing the part the coach is asking about in a warning colour. */
export type Limb = "leftArm" | "rightArm" | "leftLeg" | "rightLeg" | "torso" | "head";
