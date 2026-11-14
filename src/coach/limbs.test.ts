import { describe, expect, it } from "vitest";
import { limbForPhrase } from "./limbs";
import { PHRASE_IDS } from "./phrases";

describe("limbForPhrase", () => {
  it("maps arm, leg, torso and head corrections to body parts", () => {
    expect(limbForPhrase("raise_left_arm")).toBe("leftArm");
    expect(limbForPhrase("bend_right_elbow")).toBe("rightArm");
    expect(limbForPhrase("hand_in_left")).toBe("leftArm");
    expect(limbForPhrase("straighten_left_leg")).toBe("leftLeg");
    expect(limbForPhrase("bend_right_knee")).toBe("rightLeg");
    expect(limbForPhrase("lean_left")).toBe("torso");
    expect(limbForPhrase("tilt_head_right")).toBe("head");
  });

  it("returns null for framing, countdown and free text", () => {
    expect(limbForPhrase("step_back")).toBeNull();
    expect(limbForPhrase("cam_left")).toBeNull();
    expect(limbForPhrase("three")).toBeNull();
    expect(limbForPhrase("custom")).toBeNull();
    expect(limbForPhrase(null)).toBeNull();
  });

  it("covers every current pose correction", () => {
    const poseLines = PHRASE_IDS.filter((id) => /(arm|elbow|hand_|knee|leg|lean|straight|turn_side|face_camera|shoulders|head)/.test(id));
    for (const id of poseLines) expect(limbForPhrase(id), id).not.toBeNull();
  });
});
