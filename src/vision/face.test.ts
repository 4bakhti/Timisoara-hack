import type { Matrix } from "@mediapipe/tasks-vision";
import { describe, expect, it, vi } from "vitest";
import { createFaceTracker, readFaceSignals } from "./face";

const { createFromOptions, forVisionTasks } = vi.hoisted(() => ({
  createFromOptions: vi.fn(),
  forVisionTasks: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FaceLandmarker: { createFromOptions },
  FilesetResolver: { forVisionTasks },
}));

const transform = (data: number[]): Matrix => ({ rows: 4, columns: 4, data });

describe("readFaceSignals", () => {
  it("uses the less open eye and the average smile", () => {
    const signals = readFaceSignals([
      { categoryName: "mouthSmileRight", score: 0.8 },
      { categoryName: "eyeBlinkLeft", score: 0.1 },
      { categoryName: "mouthSmileLeft", score: 0.4 },
      { categoryName: "eyeBlinkRight", score: 0.75 },
    ]);
    expect(signals.eyesOpen).toBe(0.25);
    expect(signals.smile).toBeCloseTo(0.6);
  });

  it("reads a frontal head with arbitrary translation", () => {
    const signals = readFaceSignals([], transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, -50, 1]));
    expect(signals).toEqual({ eyesOpen: null, smile: null, yawDeg: 0, pitchDeg: 0 });
  });

  it.each([-1, 1])("reads a 45° turn with sign %i", (sign) => {
    const c = Math.SQRT1_2;
    const s = sign * c;
    // Column-major rotation about +Y. Positive rotates the nose to image right.
    const signals = readFaceSignals([], transform([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 2, 3, -50, 1]));
    expect(signals.yawDeg).toBeCloseTo(sign * 45);
    expect(signals.pitchDeg).toBe(0);
  });

  it.each([-1, 1])("reads a 30° chin tilt with sign %i", (sign) => {
    const c = Math.sqrt(3) / 2;
    const s = sign * 0.5;
    const signals = readFaceSignals([], transform([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 2, 3, -50, 1]));
    expect(signals.yawDeg).toBe(0);
    expect(signals.pitchDeg).toBeCloseTo(sign * 30);
  });

  it("keeps unavailable signals unknown", () => {
    const signals = readFaceSignals([{ categoryName: "eyeBlinkLeft", score: 0 }], transform(Array(16).fill(0)));
    expect(signals).toEqual({ eyesOpen: null, smile: null, yawDeg: null, pitchDeg: null });
  });
});

describe("createFaceTracker", () => {
  it("falls back to CPU and returns null if no face is detected", async () => {
    forVisionTasks.mockResolvedValueOnce({});
    const detectForVideo = vi.fn().mockReturnValue({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] });
    const close = vi.fn();
    createFromOptions.mockRejectedValueOnce(new Error("No GPU")).mockResolvedValueOnce({ detectForVideo, close });
    const tracker = await createFaceTracker();
    expect(tracker?.detectVideo({} as HTMLVideoElement, 42)).toBeNull();
    expect(createFromOptions).toHaveBeenNthCalledWith(2, {}, expect.objectContaining({
      baseOptions: expect.objectContaining({ delegate: "CPU" }),
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }));
    expect(detectForVideo).toHaveBeenCalledWith({}, 42);
    tracker?.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns null when the runtime fails to load", async () => {
    forVisionTasks.mockRejectedValueOnce(new Error("No WASM"));
    expect(await createFaceTracker()).toBeNull();
  });
});
