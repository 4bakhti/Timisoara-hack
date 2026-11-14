import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ grabFrame: vi.fn(), onCapture: vi.fn() }));
vi.mock("@/vision", () => ({
  grabFrame: mocks.grabFrame,
  computeShotScore: () => ({ total: 75, pose: 75, framing: 75, crop: null, light: null, level: null }),
  coverMap: vi.fn(), drawGuides: vi.fn(), hasTorso: vi.fn(), matchAll: vi.fn(), syncCanvas: vi.fn(),
  getPoseTemplate: () => ({ points: {} }),
  sourceSize: () => ({ width: 640, height: 480 }),
  watchLevel: () => () => undefined,
  createPoseTracker: async () => ({ detectVideo: vi.fn(), close: vi.fn() }),
}));
vi.mock("@/vision/score", () => ({ getStillTracker: vi.fn() }));
vi.mock("@/coach/voice", () => ({ say: vi.fn(), sayText: vi.fn(), stopSpeaking: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { events: vi.fn(), guide: vi.fn() } }));

import { createPoseEngine } from "@/coach/poseEngine";
import { createGuideEngine } from "@/coach/guideEngine";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import type { EngineConfig } from "@/coach/types";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("HTMLVideoElement", class Video {});
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("window", { setTimeout, clearTimeout });
});
afterEach(() => vi.unstubAllGlobals());

describe.each([
  ["person coach", createPoseEngine],
  ["non-person coach", createGuideEngine],
] as const)("%s capture lifecycle", (_name, createEngine) => {
  it("does not deliver a photo after the session stops during encoding", async () => {
    const frame = { blob: new Blob(["test"]), dataUrl: "data:image/jpeg;base64,dGVzdA==", width: 640, height: 480 };
    let finishEncoding!: (value: typeof frame) => void;
    mocks.grabFrame.mockImplementationOnce(() => new Promise(resolve => { finishEncoding = resolve; })).mockResolvedValue(frame);
    const config: EngineConfig = {
      source: new HTMLVideoElement(), overlay: null, idea: SAMPLE_PLAN_PERSON.ideas[0],
      mode: "solo", lang: "en", mirrored: false, voice: false,
      emit: vi.fn(), onCapture: mocks.onCapture,
    };
    const engine = createEngine(config);
    engine.start();
    // Finish asynchronous tracker initialization; never run a real camera/model.
    await Promise.resolve();
    engine.captureNow();
    expect(mocks.grabFrame).toHaveBeenCalledTimes(1);
    // Back, pause, idea change or unmount stops the old engine while JPEG encoding is pending.
    engine.stop();
    finishEncoding(frame);
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    expect(mocks.onCapture).not.toHaveBeenCalled();
  });
});
