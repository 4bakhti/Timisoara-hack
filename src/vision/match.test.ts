import { describe, expect, it } from "vitest";
import type { Box } from "@/lib/contracts";
import { angleDiff, bodyAngles3d, jointBend, mirrorFeatures, poseFeatures, templateToImage } from "./geometry";
import { anchoredBox, JUDGE_FORWARD_LEAN, matchAll, matchFraming, matchPose } from "./match";
import { buildPose, type PoseSpec } from "./poses/build";
import { POSE_TEMPLATES, getPoseTemplate } from "./poses/catalog";
import type { WorldPoints } from "./types";

const BOX: Box = { x: 0.3, y: 0.1, w: 0.4, h: 0.8 };
const PORTRAIT = 3 / 4;

const RELAXED: PoseSpec = {
  lUpperArm: 9,
  lForearm: 4,
  rUpperArm: 11,
  rForearm: 2,
  lThigh: 4,
  lShin: 0,
  rThigh: 4,
  rShin: 0,
};

const features = (spec: PoseSpec) => poseFeatures(buildPose(spec))!;

/** Camera-relative shoulders and hips in meters. */
function worldPose(yaw: number, lean: number): WorldPoints {
  const turn = (yaw * Math.PI) / 180;
  const pitch = (lean * Math.PI) / 180;
  const x = 0.2 * Math.cos(turn);
  const z = 0.2 * Math.sin(turn);
  const y = -0.5 * Math.cos(pitch);
  const depth = -0.5 * Math.sin(pitch);
  return {
    lShoulder: [x, y, depth + z],
    rShoulder: [-x, y, depth - z],
    lHip: [0.15, 0, 0],
    rHip: [-0.15, 0, 0],
  };
}

describe("3D body angles", () => {
  it.each([[0, 0], [45, 20], [-45, -15], [150, 0]])("measures yaw %i° and lean %i°", (yaw, lean) => {
    const angles = bodyAngles3d(worldPose(yaw, lean));
    expect(angles.yawDeg).toBeCloseTo(yaw);
    expect(angles.leanDeg).toBeCloseTo(lean);
  });

  it("can measure yaw without hips and skips degenerate or nonfinite points", () => {
    const { lShoulder, rShoulder } = worldPose(45, 0);
    expect(bodyAngles3d({ lShoulder, rShoulder }).yawDeg).toBeCloseTo(45);
    expect(bodyAngles3d({ lShoulder, rShoulder }).leanDeg).toBeNull();
    expect(bodyAngles3d({ lShoulder, rShoulder: lShoulder })).toEqual({ yawDeg: null, leanDeg: null });
    expect(bodyAngles3d({ lShoulder: [NaN, 0, 0], rShoulder })).toEqual({ yawDeg: null, leanDeg: null });
    expect(bodyAngles3d(undefined)).toEqual({ yawDeg: null, leanDeg: null });
  });
});

describe("angles", () => {
  it("wraps differences into (-180, 180]", () => {
    expect(angleDiff(170, -170)).toBe(-20);
    expect(angleDiff(-170, 170)).toBe(20);
    expect(angleDiff(30, 10)).toBe(20);
  });

  it("measures a straight and a right-angled joint", () => {
    expect(jointBend(10, 10)).toBe(180);
    expect(jointBend(0, 90)).toBe(90);
    expect(jointBend(undefined, 90)).toBeUndefined();
  });

  it("reads a build spec back as features", () => {
    const f = features({ ...RELAXED, lUpperArm: 90, lForearm: 90 });
    expect(f.lUpperArm).toBeCloseTo(90, 0);
    expect(f.lForearm).toBeCloseTo(90, 0);
    expect(f.rUpperArm).toBeCloseTo(11, 0);
    expect(f.lean).toBeCloseTo(0, 0);
  });

  it("reads lean with the right sign", () => {
    expect(features({ ...RELAXED, lean: 10 }).lean).toBeCloseTo(10, 0);
    expect(features({ ...RELAXED, lean: -10 }).lean).toBeCloseTo(-10, 0);
  });

  it("mirroring swaps the sides", () => {
    const f = features({ ...RELAXED, lUpperArm: 80 });
    const m = mirrorFeatures(f);
    expect(m.rUpperArm).toBeCloseTo(80, 0);
    expect(m.lUpperArm).toBeCloseTo(11, 0);
  });
});

describe("pose matching", () => {
  it("scores every template 100 against itself, with nothing to correct", () => {
    for (const t of POSE_TEMPLATES) {
      const f = poseFeatures(t.points)!;
      const m = matchPose(f, f);
      expect(m.score, t.id).toBe(100);
      expect(m.corrections, t.id).toHaveLength(0);
    }
  });

  it("tells clearly different poses apart", () => {
    const relaxed = poseFeatures(getPoseTemplate("relaxed-stand").points)!;
    const armsUp = poseFeatures(getPoseTemplate("arms-up").points)!;
    const crossed = poseFeatures(getPoseTemplate("arms-crossed").points)!;
    expect(matchPose(relaxed, armsUp).score).toBeLessThan(60);
    expect(matchPose(relaxed, crossed).score).toBeLessThan(80);
  });

  it("asks to lower an arm that is too high", () => {
    const m = matchPose(features({ ...RELAXED, lUpperArm: 80, lForearm: 80 }), features(RELAXED));
    expect(m.corrections[0].id).toBe("lower_left_arm");
  });

  it("asks to raise an arm that is too low", () => {
    const target = features({ ...RELAXED, rUpperArm: 95, rForearm: 95 });
    const m = matchPose(features(RELAXED), target);
    expect(m.corrections[0].id).toBe("raise_right_arm");
  });

  it("asks to bend an elbow that is too straight", () => {
    const target = features({ ...RELAXED, lUpperArm: 40, lForearm: -60 });
    const live = features({ ...RELAXED, lUpperArm: 40, lForearm: 35 });
    expect(matchPose(live, target).corrections.map((c) => c.id)).toContain("bend_left_elbow");
  });

  it("asks to stand straight when leaning and the pose is upright", () => {
    const m = matchPose(features({ ...RELAXED, lean: 16 }), features(RELAXED));
    expect(m.corrections.map((c) => c.id)).toContain("stand_straight");
  });

  it("accepts the mirror image of a one-sided pose", () => {
    const template = features({ ...RELAXED, lUpperArm: 42, lForearm: -58 });
    const mirroredLive = features({ ...RELAXED, lUpperArm: 11, lForearm: 2, rUpperArm: 42, rForearm: -58 });
    const m = matchPose(mirroredLive, template);
    expect(m.mirrored).toBe(true);
    expect(m.score).toBeGreaterThan(90);
  });

  it("ignores limbs that are not visible", () => {
    const template = poseFeatures(getPoseTemplate("arms-crossed").points)!;
    const live = { ...template };
    delete live.lThigh;
    delete live.rThigh;
    delete live.lShin;
    delete live.rShin;
    expect(matchPose(live, template).score).toBe(100);
  });
});

describe("3D pose matching", () => {
  function matchTemplate(id: string, world?: WorldPoints) {
    const template = getPoseTemplate(id).points;
    const live = templateToImage(template, BOX, PORTRAIT);
    return matchAll(live, template, BOX, PORTRAIT, "solo", world).pose!;
  }

  it("uses 3D turn in place of the 2D ratio and accepts either side", () => {
    const legacy = matchTemplate("three-quarter");
    const frontal = matchTemplate("three-quarter", worldPose(0, 0));
    expect(legacy.score).toBe(100);
    expect(frontal.score).toBeLessThan(legacy.score);
    // 3D turn replaces the 2D ratio; forward lean adds one more feature only when it is judged.
    expect(frontal.compared).toBe(legacy.compared + (JUDGE_FORWARD_LEAN ? 1 : 0));
    expect(frontal.corrections[0]?.id).toBe("turn_side");
    expect(matchTemplate("three-quarter", worldPose(45, 0)).score).toBe(100);
    expect(matchTemplate("three-quarter", worldPose(-45, 0)).score).toBe(100);
    expect(matchTemplate("relaxed-stand", worldPose(45, 0)).corrections[0]?.id).toBe("face_camera");
  });

  it.skipIf(JUDGE_FORWARD_LEAN)("leaves forward lean out until it is calibrated on phones", () => {
    // Upright people read up to ~17° toward the camera; that must not cost points or start a correction.
    const upright = matchTemplate("relaxed-stand", worldPose(0, 17));
    expect(upright.score).toBe(100);
    expect(upright.corrections).toEqual([]);
    expect(matchTemplate("sit-lean-in", worldPose(0, 0)).corrections.map((c) => c.id)).not.toContain("lean_forward");
  });

  it.runIf(JUDGE_FORWARD_LEAN)("compares forward lean with the sitting and upright targets", () => {
    expect(matchTemplate("sit-lean-in", worldPose(0, 0)).corrections[0]?.id).toBe("lean_forward");
    expect(matchTemplate("sit-lean-in", worldPose(0, 20)).score).toBe(100);
    expect(matchTemplate("sit-lean-in", worldPose(0, 40)).corrections[0]?.id).toBe("straighten_up");
    expect(matchTemplate("relaxed-stand", worldPose(0, 20)).corrections[0]?.id).toBe("straighten_up");
  });

  it("keeps 2D matching with unusable depth or a target without 3D measurements", () => {
    expect(matchTemplate("three-quarter", {})).toEqual(matchTemplate("three-quarter"));
    const custom = { ...getPoseTemplate("three-quarter").points };
    const live = templateToImage(custom, BOX, PORTRAIT);
    expect(matchAll(live, custom, BOX, PORTRAIT, "solo", worldPose(0, 0)))
      .toEqual(matchAll(live, custom, BOX, PORTRAIT, "solo"));
  });
});

describe("framing", () => {
  const template = getPoseTemplate("relaxed-stand").points;

  it("is perfect when the person stands exactly where the idea wants", () => {
    const live = templateToImage(template, BOX, PORTRAIT);
    const { pose, framing } = matchAll(live, template, BOX, PORTRAIT, "solo");
    expect(pose?.score).toBe(100);
    expect(framing?.score).toBeGreaterThanOrEqual(99);
    expect(framing?.corrections).toHaveLength(0);
  });

  it("tells a solo subject who is too far to image right to step to their right", () => {
    const shifted = { ...BOX, x: BOX.x + 0.2 };
    const live = templateToImage(template, shifted, PORTRAIT);
    expect(matchFraming(live, template, BOX, PORTRAIT, "solo")?.corrections[0].id).toBe("move_right");
    expect(matchFraming(live, template, BOX, PORTRAIT, "friend")?.corrections[0].id).toBe("cam_right");
  });

  it("asks for more distance when the person fills too much of the frame", () => {
    const bigger = { x: 0.2, y: 0.0, w: 0.6, h: 1 };
    const live = templateToImage(template, bigger, PORTRAIT);
    const solo = matchFraming(live, template, { x: 0.3, y: 0.2, w: 0.4, h: 0.6 }, PORTRAIT, "solo");
    expect(solo?.corrections[0].id).toBe("step_back");
    expect(solo?.sizeRatio).toBeGreaterThan(1.3);
  });

  it("asks the photographer to tilt down when the person sits low in the frame", () => {
    const lower = { ...BOX, y: BOX.y + 0.14, h: BOX.h };
    const live = templateToImage(template, lower, PORTRAIT);
    const ids = matchFraming(live, template, BOX, PORTRAIT, "friend")?.corrections.map((c) => c.id);
    expect(ids).toContain("cam_down");
  });

  it("returns null when the torso is not visible", () => {
    expect(matchFraming({ nose: [0.5, 0.2] }, template, BOX, PORTRAIT, "solo")).toBeNull();
  });

  it("counts close enough as right: a bit off-centre and smaller still scores 100 with nothing to say", () => {
    const near = { x: BOX.x + 0.1, y: BOX.y + 0.05, w: BOX.w, h: BOX.h * 0.85 };
    const framing = matchFraming(templateToImage(template, near, PORTRAIT), template, BOX, PORTRAIT, "friend");
    expect(framing?.score).toBe(100);
    expect(framing?.corrections).toEqual([]);
  });

  describe("upper-body shots (hips out of sight)", () => {
    const upperBody = { x: 0.15, y: 0.12, w: 0.7, h: 0.88 }; // reaches the bottom: cut there on purpose
    const closeUp = (box: Box) => {
      const live: Partial<Record<keyof typeof template, [number, number]>> = { ...templateToImage(template, box, PORTRAIT) };
      for (const name of ["lHip", "rHip", "lKnee", "rKnee", "lAnkle", "rAnkle"] as const) delete live[name];
      return live;
    };

    it("coaches them instead of losing the person, and does not ask a close person to step back", () => {
      const live = closeUp({ x: 0.15, y: 0.18, w: 0.7, h: 1.9 });
      const { pose, framing } = matchAll(live, template, upperBody, PORTRAIT, "solo");
      expect(pose?.score).toBeGreaterThanOrEqual(90);
      expect(framing?.score).toBe(100);
      expect(framing?.corrections).toEqual([]);
    });

    it("does not send a seated or close person back for a pose that also works upper-body", () => {
      const crossed = getPoseTemplate("arms-crossed").points;
      const live: Partial<Record<keyof typeof crossed, [number, number]>> = {
        ...templateToImage(crossed, { x: 0.15, y: 0.18, w: 0.7, h: 1.9 }, PORTRAIT),
      };
      for (const name of ["lHip", "rHip", "lKnee", "rKnee", "lAnkle", "rAnkle"] as const) delete live[name];
      // BOX is a full-length box: on its own it would want the feet in the picture.
      expect(matchFraming(live, crossed, BOX, PORTRAIT, "solo")?.corrections[0]?.id).toBe("step_back");
      const upper = matchFraming(live, crossed, BOX, PORTRAIT, "solo", { halfBody: true });
      expect(upper?.corrections).toEqual([]);
      expect(upper?.score).toBe(100);
    });

    it("still asks for distance when the head is cut off", () => {
      const live = closeUp({ x: 0.15, y: -0.02, w: 0.7, h: 1.9 });
      expect(matchFraming(live, template, upperBody, PORTRAIT, "solo")?.corrections[0].id).toBe("step_back");
    });
  });

  it("anchors the target figure on the live person's torso", () => {
    const where = { x: 0.1, y: 0.15, w: 0.4, h: 0.7 };
    const fit = anchoredBox(templateToImage(template, where, PORTRAIT), template, PORTRAIT)!;
    expect(fit.y).toBeCloseTo(where.y, 5);
    expect(fit.h).toBeCloseTo(where.h, 5);
    expect(fit.x + fit.w / 2).toBeCloseTo(where.x + where.w / 2, 5);
  });
});
