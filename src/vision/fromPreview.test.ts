import { describe, expect, it } from "vitest";
import type { Box, Point2, PosePointName } from "@/lib/contracts";
import { POSE_POINT_NAMES } from "@/lib/contracts";
import { targetFromPose } from "./fromPreview";
import { poseFeatures, templateToImage } from "./geometry";
import { matchPose } from "./match";
import { getPoseTemplate } from "./poses/catalog";
import type { TrackedPose } from "./tracker";

const ASPECT = 3 / 4;
const BOX: Box = { x: 0.3, y: 0.12, w: 0.4, h: 0.78 };

function trackedFrom(points: Record<PosePointName, Point2>): TrackedPose {
  const visibility = {} as Record<PosePointName, number>;
  for (const name of POSE_POINT_NAMES) visibility[name] = 0.9;
  return { points, all: points, visibility };
}

describe("targetFromPose", () => {
  for (const id of ["relaxed-stand", "hand-on-hip", "arms-up", "three-quarter"]) {
    it(`keeps the shape of "${id}" and places it exactly where the person stands`, () => {
      const image = templateToImage(getPoseTemplate(id).points, BOX, ASPECT);
      const target = targetFromPose(trackedFrom(image), ASPECT);
      expect(target).not.toBeNull();
      if (!target) return;

      // Same pose: the angles match the template.
      const live = poseFeatures(target.points)!;
      const original = poseFeatures(getPoseTemplate(id).points)!;
      expect(matchPose(live, original).score).toBeGreaterThanOrEqual(98);

      // Round trip: the target pose placed in the target box lands on the person.
      const placed = templateToImage(target.points, target.box, ASPECT);
      for (const name of POSE_POINT_NAMES) {
        expect(placed[name][0], `${id}.${name}.x`).toBeCloseTo(image[name][0], 6);
        expect(placed[name][1], `${id}.${name}.y`).toBeCloseTo(image[name][1], 6);
      }

      // The box surrounds the person.
      for (const name of POSE_POINT_NAMES) {
        expect(image[name][0]).toBeGreaterThanOrEqual(target.box.x);
        expect(image[name][0]).toBeLessThanOrEqual(target.box.x + target.box.w);
        expect(image[name][1]).toBeGreaterThanOrEqual(target.box.y);
        expect(image[name][1]).toBeLessThanOrEqual(target.box.y + target.box.h);
      }
    });
  }

  it("passes the outline and 3D points through", () => {
    const pose = trackedFrom(templateToImage(getPoseTemplate("relaxed-stand").points, BOX, ASPECT));
    pose.mask = { width: 2, height: 2, alpha: new Uint8ClampedArray([0, 255, 255, 0]) };
    pose.world = { nose: [0, -0.6, 0.1] };
    const target = targetFromPose(pose, ASPECT);
    expect(target?.silhouette).toBe(pose.mask);
    expect(target?.world).toBe(pose.world);
  });

  it("returns null without a torso or for a tiny person", () => {
    const image = templateToImage(getPoseTemplate("relaxed-stand").points, BOX, ASPECT);
    const noHips = trackedFrom(image);
    delete noHips.points.lHip;
    expect(targetFromPose(noHips, ASPECT)).toBeNull();

    const tiny = templateToImage(getPoseTemplate("relaxed-stand").points, { x: 0.45, y: 0.45, w: 0.05, h: 0.08 }, ASPECT);
    expect(targetFromPose(trackedFrom(tiny), ASPECT)).toBeNull();
  });
});
