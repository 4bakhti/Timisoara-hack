import { describe, expect, it } from "vitest";
import type { PosePointName, Point2 } from "@/lib/contracts";
import { POSE_POINT_NAMES } from "@/lib/contracts";
import { templateToImage } from "./geometry";
import { rollFromGravity } from "./level";
import { getPoseTemplate } from "./poses/catalog";
import { computeShotScore, cropScore, isMeasured } from "./score";
import type { TrackedPose } from "./tracker";

const PORTRAIT = 3 / 4;

function tracked(points: Record<PosePointName, Point2>): TrackedPose {
  const visibility = {} as Record<PosePointName, number>;
  for (const name of POSE_POINT_NAMES) visibility[name] = 0.9;
  return { points, all: points, visibility };
}

describe("rollFromGravity", () => {
  it("is zero when the phone is upright, in portrait or landscape", () => {
    expect(rollFromGravity(0, 9.8)).toBeCloseTo(0);
    expect(rollFromGravity(0, -9.8)).toBeCloseTo(0);
    expect(rollFromGravity(9.8, 0)).toBeCloseTo(0);
  });

  it("reports a small tilt and ignores a phone lying flat", () => {
    const tilt = rollFromGravity(Math.sin((8 * Math.PI) / 180) * 9.8, Math.cos((8 * Math.PI) / 180) * 9.8);
    expect(Math.abs(tilt!)).toBeCloseTo(8, 0);
    expect(rollFromGravity(0.3, 0.4)).toBeNull();
  });
});

describe("cropScore", () => {
  const template = getPoseTemplate("relaxed-stand").points;

  it("is 100 when the whole body is comfortably inside the frame", () => {
    const pose = tracked(templateToImage(template, { x: 0.3, y: 0.1, w: 0.4, h: 0.8 }, PORTRAIT));
    expect(cropScore(pose)).toBe(100);
  });

  it("drops when the frame cuts the legs at the ankles", () => {
    // The figure is placed so that the ankles land on the bottom edge.
    const pose = tracked(templateToImage(template, { x: 0.3, y: 0.08, w: 0.4, h: 0.94 }, PORTRAIT));
    expect(cropScore(pose)).toBeLessThan(100);
  });
});

describe("computeShotScore", () => {
  const idea = {
    id: "t",
    title: "t",
    style: "portrait" as const,
    why: "t",
    photographer: { say: "t", move: "stay" as const, height: "eye" as const, orientation: "portrait" as const },
    subject: { say: "t", poseTemplateId: "relaxed-stand" },
    framing: { subjectBox: { x: 0.3, y: 0.1, w: 0.4, h: 0.8 }, levelDeg: 0 },
    usesFromScene: ["a", "b"],
  };

  it("gives a perfect match a perfect score", () => {
    const pose = tracked(templateToImage(getPoseTemplate("relaxed-stand").points, idea.framing.subjectBox, PORTRAIT));
    const score = computeShotScore({ pose, idea, mode: "solo", aspect: PORTRAIT, level: 100 });
    expect(score.pose).toBe(100);
    expect(score.framing).toBeGreaterThanOrEqual(99);
    expect(score.total).toBeGreaterThanOrEqual(99);
    expect(score.light).toBeNull();
  });

  it("scores zero for pose and framing when the expected person is missing", () => {
    const score = computeShotScore({ pose: null, idea, mode: "solo", aspect: PORTRAIT, level: null });
    expect(score.pose).toBe(0);
    expect(score.framing).toBe(0);
    expect(score.crop).toBeNull();
    expect(score.total).toBe(0);
  });
});

describe("ideas without a person", () => {
  it("report framing, crop and light as not measured instead of zero", () => {
    const objectIdea = {
      id: "o",
      title: "o",
      style: "detail" as const,
      why: "o",
      photographer: { say: "o", move: "closer" as const, height: "high" as const, orientation: "portrait" as const },
      framing: { subjectBox: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, levelDeg: 0 },
      usesFromScene: ["a", "b"],
    };
    const score = computeShotScore({ pose: null, idea: objectIdea, mode: "friend", aspect: PORTRAIT, level: null });
    expect(score.framing).toBeNull();
    expect(score.pose).toBeNull();
    expect(score.crop).toBeNull();
    expect(score.light).toBeNull();
    expect(isMeasured(score)).toBe(false);
  });
});
