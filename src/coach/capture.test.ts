// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { grabFrame } from "@/vision";
import { createGuideEngine } from "./guideEngine";
import type { EngineConfig } from "./types";

vi.mock("@/vision", () => ({
  grabFrame: vi.fn(),
  watchLevel: () => () => undefined,
}));

const frame = () => ({
  blob: new Blob(["synthetic frame"], { type: "image/jpeg" }),
  dataUrl: "data:image/jpeg;base64,AA==",
  width: 640,
  height: 480,
});

function fixture() {
  const say = vi.fn();
  const cancel = vi.fn();
  const emit = vi.fn();
  const onCapture = vi.fn();
  const config: EngineConfig = {
    source: document.createElement("video"),
    overlay: null,
    idea: { ...SAMPLE_PLAN_PERSON.ideas[0], subject: undefined },
    mode: "solo",
    lang: "en",
    mirrored: false,
    voice: true,
    speech: { say, cancel },
    emit,
    onCapture,
  };
  return { engine: createGuideEngine(config), say, cancel, emit, onCapture };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.mocked(grabFrame).mockReset().mockResolvedValue(frame());
  vi.spyOn(api, "guide").mockResolvedValue({ match: 95, fix: null });
  vi.spyOn(api, "events").mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("coach capture adapter", () => {
  it("stops the real guide countdown synchronously when its engine is paused", async () => {
    const f = fixture();
    f.engine.start();
    await vi.advanceTimersByTimeAsync(3900);
    expect(f.emit).toHaveBeenCalledWith(expect.objectContaining({ phase: "countdown", countdown: 3 }));
    expect(f.say).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "countdown" }));
    f.engine.stop();
    await vi.advanceTimersByTimeAsync(4000);
    expect(f.cancel).toHaveBeenCalled();
    expect(f.onCapture).not.toHaveBeenCalled();
  });

  it("confirms the manual shutter only after the capture callback and blocks re-entry", async () => {
    const f = fixture();
    f.engine.start();
    const capture = f.engine.captureNow();
    expect(f.onCapture).not.toHaveBeenCalled();
    expect(await f.engine.captureNow()).toEqual({ ok: false, reason: "capture_in_progress" });
    expect(await capture).toEqual({ ok: true, outcome: "captured" });
    expect(f.onCapture).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ manual: true, width: 640 }));
    expect(await f.engine.captureNow()).toEqual({ ok: false, reason: "already_captured" });
    f.engine.stop();
  });

  it("drops a frame that finished encoding after pause or idea switch", async () => {
    const f = fixture();
    f.engine.start();
    const capture = f.engine.captureNow();
    f.engine.stop();
    expect(await capture).toEqual({ ok: false, reason: "stale" });
    expect(f.onCapture).not.toHaveBeenCalled();
  });
});
