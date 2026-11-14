// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { resetServerVoice, speakInstruction, stopSpeaking } from "./voice";

const speak = vi.fn();
const cancel = vi.fn();
const utterances: FakeUtterance[] = [];

class FakeUtterance {
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {
    utterances.push(this);
  }
}

const en = { id: "custom", text: "Tilt the phone a little.", to: "photographer" } as const;
const ro = { id: "custom", text: "Înclină puțin telefonul.", to: "photographer" } as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("speechSynthesis", { speak, cancel });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  utterances.length = 0;
  speak.mockClear();
  cancel.mockClear();
  resetServerVoice();
});
afterEach(() => {
  stopSpeaking();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("coach voice playback", () => {
  it("falls back to Romanian device speech when TTS is unavailable", async () => {
    vi.spyOn(api, "speak").mockResolvedValue(null);
    const speech = speakInstruction(ro, "ro");
    await Promise.resolve();
    expect(speak).toHaveBeenCalledOnce();
    expect(utterances[0]).toMatchObject({ lang: "ro-RO", text: ro.text });
    utterances[0].onend?.();
    await speech;
  });

  it("cancels an obsolete synthesis request without speaking its fallback", async () => {
    let finish!: (value: null) => void;
    const request = vi.spyOn(api, "speak").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    const speech = speakInstruction(en, "en", { signal: controller.signal });
    controller.abort();
    expect(request.mock.calls[0][1]?.aborted).toBe(true);
    finish(null);
    await speech;
    expect(speak).not.toHaveBeenCalled();
  });

  it("uses the device voice at once for two minutes after the server voice fails", async () => {
    const request = vi.spyOn(api, "speak").mockResolvedValue(null);
    const finishLine = async (line: Promise<void>) => {
      await vi.advanceTimersByTimeAsync(0);
      utterances.at(-1)?.onend?.();
      await line;
    };

    await finishLine(speakInstruction(en, "en"));
    expect(request).toHaveBeenCalledOnce();

    await finishLine(speakInstruction(ro, "ro"));
    expect(request).toHaveBeenCalledOnce();
    expect(utterances.at(-1)).toMatchObject({ text: ro.text, lang: "ro-RO" });

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await finishLine(speakInstruction(en, "en"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("uses local speech for the countdown and interrupts stale audio", async () => {
    const request = vi.spyOn(api, "speak").mockResolvedValue(null);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("clip missing"));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

    const first = speakInstruction(en, "en");
    await Promise.resolve();
    const count = speakInstruction({ id: "three", text: "Trei.", to: "anyone" }, "ro", { localOnly: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(utterances.at(-1)).toMatchObject({ text: "Trei.", lang: "ro-RO" });
    stopSpeaking();
    await Promise.all([first, count]);
  });
});
