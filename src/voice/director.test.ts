import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceDirector } from "./director";
import { VoiceProviderFailure, type ProviderEvents, type VoiceToolName } from "./provider";
import type { VoiceActions, VoiceContext, VoiceLine } from "./types";
import type { PlayLine } from "./audio";

const instruction = { id: "move_left", text: "Take a small step to your left.", to: "subject" } as const;

function fixture() {
  const actions = {
    selectIdea: vi.fn<VoiceActions["selectIdea"]>(() => ({ ok: true, outcome: "idea_selected" })),
    setCoachingPaused: vi.fn<VoiceActions["setCoachingPaused"]>((paused) => ({ ok: true, outcome: paused ? "paused" : "resumed" })),
    requestCapture: vi.fn<VoiceActions["requestCapture"]>(() => ({ ok: true, outcome: "captured" })),
  };
  const events: ProviderEvents[] = [];
  const sessions: ReturnType<typeof mockSession>[] = [];
  let volume = 1;
  const connect = vi.fn(async (_lang, _signal, callbacks: ProviderEvents) => {
    const session = mockSession();
    events.push(callbacks);
    sessions.push(session);
    callbacks.configured();
    callbacks.created(session);
    return session;
  });
  const playback: { line: VoiceLine; signal: AbortSignal; finish(): void; volume: number }[] = [];
  const play: PlayLine = (line, signal) => new Promise((resolve) => {
    playback.push({ line, signal, finish: resolve, volume });
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
  const director = createVoiceDirector(actions, { connect, play });

  function mockSession() {
    return {
      endSession: vi.fn(async () => undefined),
      isOpen: () => true,
      sendContextualUpdate: vi.fn(),
      sendUserActivity: vi.fn(),
      setMicMuted: vi.fn(),
      setVolume: vi.fn(({ volume: next }: { volume: number }) => { volume = next; }),
    };
  }

  const snapshot: VoiceContext = {
    lang: "en",
    phase: "coach",
    ideas: [{ id: "first", title: "By the window" }, { id: "second", title: "Wide shot" }],
    selectedIdeaId: "first",
    scene: null,
    coachPhase: "coaching",
    instruction,
    paused: false,
    cameraReady: true,
    personTracked: true,
    updatedAt: 0,
  };
  const update = (patch: Partial<VoiceContext> = {}) => {
    Object.assign(snapshot, { updatedAt: Date.now(), ...patch });
    director.updateContext({ ...snapshot });
  };
  const provider = () => events.at(-1)!;
  const speak = (text = "Which way?") => provider().transcript({ speaker: "user", text });
  const tool = async (name: VoiceToolName, id: string, args: unknown = {}) =>
    JSON.parse(await provider().tool(name, id, args));
  const correction: VoiceLine = { instruction, ideaId: "first", lang: "en", kind: "correction" };
  const count: VoiceLine = {
    ...correction,
    instruction: { id: "three", text: "Three.", to: "anyone" },
    kind: "countdown",
  };
  return { actions, connect, director, update, provider, sessions, speak, tool, correction, count, playback };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
afterEach(() => { vi.useRealTimers(); });

describe("voice director with a mocked conversation and audio output", () => {
  it("sends changed summaries, then explicitly plays the engine's exact correction", async () => {
    const f = fixture();
    f.update();
    await f.director.start("en");
    const send = f.sessions[0].sendContextualUpdate;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.stringContaining('"scene":null'));
    f.update();
    await vi.advanceTimersByTimeAsync(250);
    expect(send).toHaveBeenCalledTimes(1);
    expect(f.playback).toHaveLength(0);
    f.director.deliverCorrection(f.correction);
    expect(f.playback[0].line.instruction).toEqual(instruction);
    expect(f.playback[0].volume).toBe(0);
    f.speak();
    expect(f.playback[0].signal.aborted).toBe(true);
    expect(f.sessions[0].setVolume).toHaveBeenLastCalledWith({ volume: 1 });
    await f.director.end();
  });

  it("drops a queued correction during an utterance and lets local countdown own audio", async () => {
    const f = fixture();
    f.update();
    await f.director.start("en");
    f.provider().mode("speaking");
    f.director.deliverCorrection(f.correction);
    await vi.advanceTimersByTimeAsync(2300);
    f.provider().mode("listening");
    expect(f.playback).toHaveLength(0);
    f.provider().mode("speaking");
    f.update({ coachPhase: "countdown" });
    f.director.deliverCorrection(f.count);
    expect(f.playback[0].volume).toBe(0);
    f.director.cancelSpeech();
    expect(f.playback[0].signal.aborted).toBe(true);
    f.update({ paused: true });
    expect(f.sessions[0].setVolume).toHaveBeenLastCalledWith({ volume: 0 });
    expect(f.sessions[0].setMicMuted).toHaveBeenLastCalledWith(false);
    f.provider().mode("listening");
    await vi.advanceTimersByTimeAsync(550);
    expect(f.sessions[0].setVolume).toHaveBeenLastCalledWith({ volume: 1 });
    await f.director.end();
  });

  it("rejects unsolicited and malformed requests and returns only the current correction", async () => {
    const f = fixture();
    f.update();
    await f.director.start("en");
    expect(await f.tool("request_capture", "unprompted")).toEqual({ ok: false, reason: "unavailable" });
    f.speak();
    expect(await f.tool("select_idea", "bad", { ideaId: 25 })).toEqual({ ok: false, reason: "invalid_arguments" });
    expect(await f.tool("select_idea", "unsupported", { ideaId: "seated" })).toEqual({ ok: false, reason: "unknown_idea" });
    expect(await f.tool("repeat_instruction", "repeat")).toEqual({ ok: true, outcome: "repeat_instruction", instruction });
    f.update({ cameraReady: false });
    expect(await f.tool("request_capture", "no-camera")).toEqual({ ok: false, reason: "camera_not_ready" });
    await vi.advanceTimersByTimeAsync(6001);
    expect(await f.tool("repeat_instruction", "expired")).toEqual({ ok: false, reason: "stale" });
    expect(f.actions.requestCapture).not.toHaveBeenCalled();
    await f.director.end();
  });

  it("shares a repeated tool ID and never opens a second shutter while capture is pending", async () => {
    const f = fixture();
    f.update();
    let finish!: () => void;
    f.actions.requestCapture.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ ok: true, outcome: "captured" });
    }));
    await f.director.start("en");
    f.speak("Take a photo.");
    const first = f.tool("request_capture", "photo");
    const duplicate = f.tool("request_capture", "photo");
    await Promise.resolve();
    expect(await f.tool("request_capture", "different-id")).toEqual({ ok: false, reason: "capture_in_progress" });
    finish();
    expect(await first).toEqual({ ok: true, outcome: "captured" });
    expect(await duplicate).toEqual(await first);
    expect(await f.tool("request_capture", "after")).toEqual({ ok: false, reason: "already_captured" });
    expect(f.actions.requestCapture).toHaveBeenCalledTimes(1);
    await f.director.end();
  });

  it("aborts a delayed callback if the photographer changes the idea", async () => {
    const f = fixture();
    f.update();
    f.actions.requestCapture.mockImplementation((signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ ok: false, reason: "stale" }), { once: true });
    }));
    await f.director.start("en");
    f.speak();
    const photo = f.tool("request_capture", "photo");
    await Promise.resolve();
    f.update({ selectedIdeaId: "second" });
    expect(await photo).toEqual({ ok: false, reason: "stale" });
    expect(f.actions.requestCapture.mock.calls[0][0].aborted).toBe(true);
    await f.director.end();
  });

  it("keeps the microphone open for pause and resume and rejects duplicate countdown capture", async () => {
    const f = fixture();
    f.update({ coachPhase: "countdown" });
    f.actions.setCoachingPaused.mockImplementation((paused) => {
      f.update({ paused, coachPhase: paused ? null : "loading" });
      return { ok: true, outcome: paused ? "paused" : "resumed" };
    });
    await f.director.start("ro");
    expect(f.sessions[0].setMicMuted).toHaveBeenLastCalledWith(false);
    f.speak("Fă o poză.");
    expect(await f.tool("request_capture", "during-count")).toEqual({ ok: false, reason: "capture_in_progress" });
    f.speak("Pauză.");
    expect(await f.tool("set_coaching_paused", "pause", { paused: true })).toEqual({ ok: true, outcome: "paused" });
    f.speak("Fă o poză.");
    expect(await f.tool("request_capture", "while-paused")).toEqual({ ok: false, reason: "paused" });
    f.speak("Continuă.");
    expect(await f.tool("set_coaching_paused", "resume", { paused: false })).toEqual({ ok: true, outcome: "resumed" });
    await f.director.end();
  });

  it("lets the completed photo result reach the provider before closing the conversation", async () => {
    const f = fixture();
    f.update();
    let ended!: Promise<void>;
    f.actions.requestCapture.mockImplementation(() => {
      f.update({ phase: "result" });
      ended = f.director.end({ afterCapture: true });
      return { ok: true, outcome: "captured" };
    });
    await f.director.start("en");
    f.speak("Take a photo.");
    expect(await f.tool("request_capture", "result-shot")).toEqual({ ok: true, outcome: "captured" });
    expect(f.sessions[0].endSession).not.toHaveBeenCalled();
    expect(f.sessions[0].setMicMuted).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(0);
    await ended;
    expect(f.sessions[0].endSession).toHaveBeenCalledOnce();
  });

  it("ends the old session on disconnect and ignores its events after reconnect", async () => {
    const f = fixture();
    f.update();
    await f.director.start("en");
    f.speak("Hello");
    const first = f.provider();
    first.disconnected();
    expect(f.director.getState()).toMatchObject({ status: "error", reason: "connection_lost", transcript: null });
    await f.director.start("ro");
    first.transcript({ speaker: "user", text: "Stale line" });
    expect(f.sessions[0].endSession).toHaveBeenCalledTimes(1);
    expect(f.director.getState()).toMatchObject({ status: "listening", configured: true, transcript: null });
    await f.director.end();
  });

  it("reports unavailable provider setup and still plays the local correction", async () => {
    const f = fixture();
    f.connect.mockRejectedValueOnce(new VoiceProviderFailure("not_configured"));
    f.update();
    await f.director.start("en");
    expect(f.director.getState()).toMatchObject({ status: "error", reason: "not_configured", configured: false });
    f.director.deliverCorrection(f.correction);
    expect(f.playback[0].line).toEqual(f.correction);
    await f.director.end();
  });
});
