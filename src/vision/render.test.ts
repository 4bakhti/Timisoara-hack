import { describe, expect, it } from "vitest";
import { BONES, boneLimb, coverMap } from "./render";

describe("boneLimb", () => {
  it("assigns every bone to the right body part", () => {
    const parts = Object.fromEntries(BONES.map(([a, b]) => [`${a}-${b}`, boneLimb(a, b)]));
    expect(parts["lShoulder-lElbow"]).toBe("leftArm");
    expect(parts["lElbow-lWrist"]).toBe("leftArm");
    expect(parts["rShoulder-rElbow"]).toBe("rightArm");
    expect(parts["rElbow-rWrist"]).toBe("rightArm");
    expect(parts["lHip-lKnee"]).toBe("leftLeg");
    expect(parts["lKnee-lAnkle"]).toBe("leftLeg");
    expect(parts["rHip-rKnee"]).toBe("rightLeg");
    expect(parts["rKnee-rAnkle"]).toBe("rightLeg");
    expect(parts["lShoulder-rShoulder"]).toBe("torso");
    expect(parts["lShoulder-lHip"]).toBe("torso");
    expect(parts["lHip-rHip"]).toBe("torso");
  });
});

describe("coverMap", () => {
  it("fills the view and centres the overflow", () => {
    // A 4:3 landscape picture in a tall phone view is cropped left and right.
    const map = coverMap(1280, 960, 390, 844);
    expect(map.y(0)).toBeCloseTo(0);
    expect(map.y(1)).toBeCloseTo(844);
    expect(map.x(0.5)).toBeCloseTo(195);
    expect(map.x(0)).toBeLessThan(0);
  });
});

import { movementArrow, placeTemplate, type GuideFrame } from "./render";
import { getPoseTemplate } from "./poses/catalog";

describe("minimal movement arrow", () => {
  const map = coverMap(400, 600, 400, 600);
  const ghost = getPoseTemplate("relaxed-stand").points;
  const box = { x: .2, y: .1, w: .6, h: .8 };
  const target = placeTemplate(ghost, box, map);
  const base: GuideFrame = { map, ghost, targetBox: box, ghostBox: box, highlight: ["leftArm"], live: { lWrist: [target.lWrist[0] / 400 - .1, target.lWrist[1] / 600] } };
  it("points from the actual joint to the target and disappears when matched", () => {
    const arrow = movementArrow(base)!;
    expect(arrow.to).toEqual(target.lWrist);
    expect(arrow.to[0] - arrow.from[0]).toBeCloseTo(40);
    expect(movementArrow({ ...base, matched: true })).toBeNull();
  });
  it("does not draw arrows for invisible joints, a different limb or subpixel changes", () => {
    expect(movementArrow({ ...base, live: {} })).toBeNull();
    expect(movementArrow({ ...base, highlight: ["rightArm"] })).toBeNull();
    expect(movementArrow({ ...base, live: { lWrist: [target.lWrist[0] / 400 - .001, target.lWrist[1] / 600] } })).toBeNull();
  });
});
