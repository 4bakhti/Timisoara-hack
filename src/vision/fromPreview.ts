/**
 * Turns an AI pose preview into a coaching target: the pose in the same format
 * as the templates, where the person stands, their outline and their 3D points.
 *
 * The preview is an edit of the user's own scene photo, so its framing matches
 * the camera's: the target outline lands where the person should stand.
 */
import type { Box, PosePointName, PosePoints } from "@/lib/contracts";
import { POSE_POINT_NAMES } from "@/lib/contracts";
import { createStillTracker, hasTorso, type StillTracker, type TrackedPose } from "./tracker";
import type { CustomTarget } from "./types";

/** A person smaller than this share of the picture's height is too small to coach toward. */
const MIN_FIGURE_HEIGHT = 0.15;

/**
 * Builds a target from a tracked pose in a picture with the given aspect
 * (width / height). Pure; see the tests. Returns null without a usable torso.
 */
export function targetFromPose(pose: TrackedPose, aspect: number): CustomTarget | null {
  if (!hasTorso(pose.points)) return null;
  const all = pose.all;

  // Head and feet reach a little beyond the nose and ankle points.
  const shoulderY = (all.lShoulder[1] + all.rShoulder[1]) / 2;
  const neck = Math.max(0.01, shoulderY - all.nose[1]);
  const xs = POSE_POINT_NAMES.map((n) => all[n][0]);
  const ys = POSE_POINT_NAMES.map((n) => all[n][1]);
  const top = Math.min(all.nose[1] - neck * 0.75, ...ys);
  const bottom = Math.max(Math.max(all.lAnkle[1], all.rAnkle[1]) + neck * 0.2, ...ys);
  const height = bottom - top;
  if (!(height >= MIN_FIGURE_HEIGHT)) return null;

  // Width: the joints plus room for the body around them (in image-width units).
  const margin = (0.06 * height) / aspect;
  const left = Math.min(...xs) - margin;
  const right = Math.max(...xs) + margin;
  const box: Box = { x: left, y: top, w: right - left, h: height };

  // The template format: the figure fills the box height and is centred
  // horizontally, in units of that height (so widths are not stretched).
  const centreX = left + (right - left) / 2;
  const points = {} as PosePoints;
  for (const name of POSE_POINT_NAMES) {
    const [x, y] = all[name];
    points[name as PosePointName] = [0.5 + ((x - centreX) * aspect) / height, (y - top) / height];
  }
  return { points, box, silhouette: pose.mask, world: pose.world };
}

let previewTracker: Promise<StillTracker> | null = null;

function getPreviewTracker(): Promise<StillTracker> {
  previewTracker ??= createStillTracker({ withMask: true });
  return previewTracker;
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

/** Reads a preview picture (data URL or address) and returns its coaching target, or null. */
export async function targetFromPreview(src: string): Promise<CustomTarget | null> {
  try {
    const image = await loadImage(src);
    const tracker = await getPreviewTracker();
    const pose = tracker.detect(image);
    return pose ? targetFromPose(pose, image.naturalWidth / Math.max(1, image.naturalHeight)) : null;
  } catch {
    return null;
  }
}
