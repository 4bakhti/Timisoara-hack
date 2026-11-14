import { describe, expect, it } from "vitest";
import type { FaceSignals } from "@/vision/types";
import type { FramingMatch, PoseMatch } from "@/vision/match";
import { CoachBrain, TIMING, levelScore, type Decision, type Measurement } from "./brain";
import type { PhraseId } from "./phrases";

const goodFraming: FramingMatch = { score: 96, sizeRatio: 1, dx: 0, dy: 0, corrections: [] };
const goodPose: PoseMatch = { score: 95, mirrored: false, compared: 10, corrections: [] };

const poseNeeds = (id: PhraseId, weight = 0.8, score = 55): PoseMatch => ({
  score,
  mirrored: false,
  compared: 10,
  corrections: [{ id, weight }],
});

const framingNeeds = (id: PhraseId, weight = 2): FramingMatch => ({
  score: 40,
  sizeRatio: 1,
  dx: 0.2,
  dy: 0,
  corrections: [{ id, weight }],
});

/** Feeds the same measurement every 100 ms and collects the decisions. */
function run(
  brain: CoachBrain,
  from: number,
  to: number,
  m: Omit<Measurement, "now">,
): { decisions: Decision[]; spoken: PhraseId[]; last: Decision } {
  const decisions: Decision[] = [];
  const spoken: PhraseId[] = [];
  for (let now = from; now <= to; now += 100) {
    const d = brain.update({ ...m, now });
    decisions.push(d);
    if (d.speak) spoken.push(d.speak);
  }
  return { decisions, spoken, last: decisions[decisions.length - 1] };
}

const visible = { personVisible: true, levelError: null } as const;
const matched = { ...visible, pose: goodPose, framing: goodFraming };
const openFace: FaceSignals = { eyesOpen: 0.9, smile: 0.6, yawDeg: 0, pitchDeg: 0 };
const closedFace = { ...openFace, eyesOpen: 0.2 };

describe("levelScore", () => {
  it("is null without a reading and falls as the phone tilts", () => {
    expect(levelScore(null)).toBeNull();
    expect(levelScore(0)).toBe(100);
    expect(levelScore(10)!).toBeLessThan(40);
  });
});

describe("CoachBrain", () => {
  it("introduces itself, then asks the person to step in", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const { spoken, last } = run(brain, 0, 5000, { personVisible: false, pose: null, framing: null, levelError: null });
    expect(spoken[0]).toBe("intro_solo");
    expect(spoken).toContain("step_in");
    expect(last.phase).toBe("searching");
    expect(last.instruction).toBe("step_in");
  });

  it("puts framing before pose", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const { last } = run(brain, 0, 2000, {
      ...visible,
      pose: poseNeeds("raise_left_arm"),
      framing: framingNeeds("step_back"),
    });
    expect(last.phase).toBe("coaching");
    expect(last.instruction).toBe("step_back");
  });

  it("speaks a pose correction once, then waits before repeating it", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const { spoken } = run(brain, 0, 6000, { ...visible, pose: poseNeeds("raise_left_arm"), framing: goodFraming });
    expect(spoken.filter((s) => s === "raise_left_arm")).toHaveLength(1);
    const later = run(brain, 6100, 12000, { ...visible, pose: poseNeeds("raise_left_arm"), framing: goodFraming });
    expect(later.spoken.filter((s) => s === "raise_left_arm")).toHaveLength(1);
  });

  it("shows photographer lines in friend mode without speaking them", () => {
    const brain = new CoachBrain({ mode: "friend", expectPose: true });
    const { spoken, last } = run(brain, 0, 6000, { ...visible, pose: goodPose, framing: framingNeeds("cam_left") });
    expect(last.instruction).toBe("cam_left");
    expect(spoken).not.toContain("cam_left");
  });

  it("asks the photographer to level the phone in friend mode only", () => {
    const friend = new CoachBrain({ mode: "friend", expectPose: true });
    expect(run(friend, 0, 2000, { personVisible: true, pose: goodPose, framing: goodFraming, levelError: 12 }).last.instruction).toBe("cam_level");
    const solo = new CoachBrain({ mode: "solo", expectPose: true });
    expect(run(solo, 0, 2000, { personVisible: true, pose: goodPose, framing: goodFraming, levelError: 12 }).last.instruction).not.toBe("cam_level");
  });

  it("does not flicker between two corrections", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    run(brain, 0, 1500, { ...visible, pose: poseNeeds("raise_left_arm"), framing: goodFraming });
    const shown = new Set<PhraseId | null>();
    for (let now = 1600; now <= 4000; now += 100) {
      // The top correction alternates every frame.
      const id: PhraseId = (now / 100) % 2 === 0 ? "bend_right_elbow" : "raise_left_arm";
      const other: PhraseId = id === "raise_left_arm" ? "bend_right_elbow" : "raise_left_arm";
      const pose: PoseMatch = {
        score: 55,
        mirrored: false,
        compared: 10,
        corrections: [
          { id, weight: 0.8 },
          { id: other, weight: 0.7 },
        ],
      };
      shown.add(brain.update({ ...visible, now, pose, framing: goodFraming }).instruction);
    }
    expect(shown.size).toBe(1);
  });

  it("holds, counts down and captures exactly once when everything matches", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const { decisions, spoken } = run(brain, 0, 6000, { ...visible, pose: goodPose, framing: goodFraming });
    const phases = decisions.map((d) => d.phase);
    expect(phases).toContain("holding");
    expect(phases).toContain("countdown");
    expect(decisions.filter((d) => d.capture)).toHaveLength(1);
    expect(decisions[decisions.length - 1].phase).toBe("captured");
    const tail = spoken.slice(-5);
    expect(tail).toEqual(["hold", "three", "two", "one", "got_it"]);
    expect(decisions.filter((d) => d.phase === "countdown").map((d) => d.countdown)).toContain(3);
  });

  it("waits to finish the hold until the eyes open", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const paused = run(brain, 0, 5000, { ...matched, face: closedFace });
    expect(paused.last).toMatchObject({ phase: "holding", instruction: "eyes_open", countdown: null, capture: false });
    expect(paused.spoken.filter((id) => id === "eyes_open")).toHaveLength(1);
    const resumed = run(brain, 5100, 9000, { ...matched, face: openFace });
    expect(resumed.decisions[0]).toMatchObject({ phase: "holding", instruction: "hold", capture: false });
    expect(resumed.spoken).toEqual(["three", "two", "one", "got_it"]);
    expect(resumed.decisions.filter((decision) => decision.capture)).toHaveLength(1);
  });

  it("freezes the last countdown step when the next frame has closed eyes", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const counting = run(brain, 0, 3100, { ...matched, face: openFace });
    expect(counting.last).toMatchObject({ phase: "countdown", countdown: 1 });
    const paused = run(brain, 4000, 5000, { ...matched, face: closedFace });
    expect(paused.last).toMatchObject({ phase: "countdown", instruction: "eyes_open", countdown: 1, capture: false });
    expect(paused.spoken).toEqual(["eyes_open"]);
    const missing = brain.update({ ...matched, now: 5100, face: null });
    expect(missing).toMatchObject({ countdown: 1, capture: false });
    const resumed = run(brain, 5200, 6300, { ...matched, face: openFace });
    expect(resumed.decisions[0]).toMatchObject({ countdown: 1, capture: false });
    expect(resumed.decisions.filter((decision) => decision.capture)).toHaveLength(1);
  });

  it("keeps the regular capture sequence when face tracking is unavailable", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true, style: "portrait" });
    const result = run(brain, 0, 4500, { ...matched, face: null });
    expect(result.spoken).toEqual(["intro_solo", "hold", "three", "two", "one", "got_it"]);
  });

  it.each(["portrait", "dramatic"] as const)("asks for eye contact in %s once the pose reaches 75", (style) => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true, style });
    const face = { ...openFace, yawDeg: -25 };
    const earlier = run(brain, 0, 3000, { ...matched, pose: { ...goodPose, score: 74 }, face });
    expect(earlier.spoken).not.toContain("look_at_camera");
    const later = run(brain, 3100, 6500, { ...matched, pose: { ...goodPose, score: 75 }, face });
    expect(later.spoken).toContain("look_at_camera");
  });

  it("continues toward capture once the optional eye-contact cue is spoken", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true, style: "portrait" });
    const result = run(brain, 0, 8000, { ...matched, face: { ...openFace, yawDeg: 30 } });
    expect(result.spoken).toContain("look_at_camera");
    expect(result.decisions.filter((decision) => decision.capture)).toHaveLength(1);
  });

  it.each([[18, "chin_down"], [-18, "chin_up"]] as const)("corrects portrait head pitch of %i degrees", (pitchDeg, cue) => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true, style: "portrait" });
    const result = run(brain, 0, 3000, { ...matched, face: { ...openFace, pitchDeg } });
    expect(result.spoken).toContain(cue);
  });

  it("prioritizes framing and pose corrections over eye contact", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true, style: "portrait" });
    const face = { ...openFace, yawDeg: 30 };
    const framing = run(brain, 0, 3000, { ...matched, framing: framingNeeds("step_back"), face });
    expect(framing.last.instruction).toBe("step_back");
    const pose = run(brain, 3100, 6000, { ...matched, pose: poseNeeds("raise_left_arm", 0.4, 80), face });
    expect(pose.last.instruction).toBe("raise_left_arm");
    expect([...framing.spoken, ...pose.spoken]).not.toContain("look_at_camera");
  });

  it.each(["playful", "candid"] as const)("offers one optional smile in %s and continues to capture", (style) => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true, style });
    const face = { ...openFace, smile: 0.1, yawDeg: 25, pitchDeg: 18 };
    const result = run(brain, 0, 15000, { ...matched, face });
    expect(result.spoken.filter((id) => id === "smile")).toHaveLength(1);
    expect(result.spoken).not.toContain("look_at_camera");
    expect(result.spoken).not.toContain("chin_down");
    expect(result.decisions.filter((decision) => decision.capture)).toHaveLength(1);
  });

  it("skips smile and eye-contact cues in other styles", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const face = { ...openFace, smile: 0, yawDeg: 25, pitchDeg: 18 };
    const result = run(brain, 0, 4500, { ...matched, face });
    expect(result.spoken).toEqual(["intro_solo", "hold", "three", "two", "one", "got_it"]);
  });

  it("cancels the countdown when the match drops", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    const settle = TIMING.settleFor + TIMING.holdFor + 500;
    const first = run(brain, 0, settle, { ...visible, pose: goodPose, framing: goodFraming });
    expect(["holding", "countdown"]).toContain(first.last.phase);
    const dropped = run(brain, settle + 100, settle + 2500, {
      ...visible,
      pose: poseNeeds("raise_left_arm", 0.9, 20),
      framing: framingNeeds("step_back"),
    });
    expect(dropped.last.phase).toBe("coaching");
    expect(dropped.decisions.some((d) => d.capture)).toBe(false);
  });

  it("judges framing only when the idea has no pose", () => {
    const brain = new CoachBrain({ mode: "friend", expectPose: false });
    const { last, decisions } = run(brain, 0, 6000, { ...visible, pose: poseNeeds("raise_left_arm"), framing: goodFraming });
    expect(last.parts.pose).toBeNull();
    expect(decisions.some((d) => d.capture)).toBe(true);
  });

  it("says it lost the person after they leave the frame", () => {
    const brain = new CoachBrain({ mode: "solo", expectPose: true });
    run(brain, 0, 1000, { ...visible, pose: poseNeeds("raise_left_arm"), framing: goodFraming });
    const { last } = run(brain, 1100, 4000, { personVisible: false, pose: null, framing: null, levelError: null });
    expect(last.phase).toBe("searching");
    expect(last.instruction).toBe("lost");
  });
});
