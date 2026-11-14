// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedShot, CoachSessionOptions, CoachSpeech } from "@/coach";
import { ShootFlow } from "@/components/ShootFlow";
import { HEALTH_NO_DB } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { setLang } from "@/state/lang";
import type { VoiceActions, VoiceDirectorState } from "@/voice";

/**
 * The voice conversation is replaced by a stand-in, the way src/voice/director.test.ts
 * replaces the provider SDK: no microphone, no network, no ElevenLabs. Real behaviour
 * with a configured agent cannot be checked without credentials.
 */
const voice = vi.hoisted(() => {
  const speech = { say: () => undefined, cancel: () => undefined };
  return {
    actions: null as VoiceActions | null,
    mounted: 0,
    speech,
    state: { status: "disconnected", configured: true, micMuted: false, reason: null, transcript: null } as VoiceDirectorState,
    director: {
      start: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      checkAvailability: vi.fn(async () => undefined),
      setMicMuted: vi.fn(),
      setOutputEnabled: vi.fn(),
      updateContext: vi.fn(),
      deliverCorrection: vi.fn(),
      cancelSpeech: vi.fn(),
      getState: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    },
  };
});

vi.mock("@/voice", () => ({
  useVoiceDirector: (actions: VoiceActions) => {
    voice.actions = actions;
    voice.mounted += 1;
    return { director: voice.director, state: voice.state, speech: voice.speech };
  },
}));

const coach = vi.hoisted(() => ({
  options: null as CoachSessionOptions | null,
  cancelPendingCapture: null as null | (() => void),
  unlockAudio: null as null | (() => void),
}));

vi.mock("@/coach", async () => {
  const { vi: v } = await import("vitest");
  coach.cancelPendingCapture = v.fn();
  coach.unlockAudio = v.fn();
  return {
    unlockAudio: () => coach.unlockAudio?.(),
    useCoachSession: (options: CoachSessionOptions) => {
      coach.options = options;
      const shot: CapturedShot = {
        blob: new Blob(["after"], { type: "image/jpeg" }),
        dataUrl: "data:image/jpeg;base64,QUZURVI=",
        width: 3,
        height: 4,
        score: { total: 72, framing: 80, level: null, pose: 64, crop: null, light: null },
        manual: true,
      };
      return {
        phase: "coaching" as const,
        score: 40,
        parts: { pose: null, framing: null, level: null },
        instruction: null,
        countdown: null,
        personVisible: true,
        fps: 0,
        simulated: false,
        error: null,
        captureNow: () => options.onCapture(shot),
        requestCapture: async () => {
          options.onCapture(shot);
          return { ok: true as const, outcome: "captured" as const };
        },
        cancelPendingCapture: () => coach.cancelPendingCapture?.(),
        restart: () => undefined,
      };
    },
  };
});

vi.mock("@/vision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/vision")>();
  return {
    ...actual,
    requestMotionPermission: vi.fn(async () => false),
    shrinkImage: vi.fn(async () => "data:image/jpeg;base64,QkVGT1JF"),
    scoreStill: vi.fn(async () => null),
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, analyze: vi.fn(), review: vi.fn(), feedback: vi.fn(), health: vi.fn(), recipes: { list: vi.fn(), get: vi.fn(), create: vi.fn() } },
  };
});

const button = (name: string) => screen.getByRole("button", { name });
const signal = () => new AbortController().signal;

function choosePicture() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "scene.jpg", { type: "image/jpeg" })] } });
}

async function toIdeas(mock = true) {
  vi.mocked(api.analyze).mockResolvedValue({ plan: SAMPLE_PLAN_PERSON, ...(mock ? { mock: true } : {}) });
  render(<ShootFlow />);
  choosePicture();
  fireEvent.click(button(t("readScene", "en")));
  await screen.findByText(t("pickShot", "en"));
}

function startTalking() {
  fireEvent.click(button(t("talkStart", "en")));
  fireEvent.click(button(t("talkAgree", "en")));
}

beforeEach(() => {
  setLang("en");
  voice.actions = null;
  voice.mounted = 0;
  voice.state = { status: "disconnected", configured: true, micMuted: false, reason: null, transcript: null };
  Object.values(voice.director).forEach((fn) => fn.mockClear());
  vi.mocked(coach.cancelPendingCapture!).mockClear();
  vi.mocked(coach.unlockAudio!).mockClear();
  vi.mocked(api.health).mockResolvedValue(HEALTH_NO_DB);
  vi.mocked(api.review).mockResolvedValue({ improved: ["x"], lesson: { title: "y", text: "z" } });
  URL.createObjectURL = vi.fn(() => "blob:test-picture");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("voice conversation: availability", () => {
  it("is invisible when the server has no conversation configured, and the flow is unchanged", async () => {
    voice.state = { ...voice.state, configured: false };
    await toIdeas();
    expect(screen.queryByRole("button", { name: t("talkStart", "en") })).toBeNull();
    expect(screen.queryByTestId("voice-control")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    expect(coach.options?.speech).toBeUndefined();
    expect(coach.options?.paused).toBe(false);
    expect(voice.director.start).not.toHaveBeenCalled();
    expect(voice.director.updateContext).not.toHaveBeenCalled();
  });

  it("is invisible while availability is still unknown", () => {
    voice.state = { ...voice.state, configured: null };
    render(<ShootFlow />);
    choosePicture();
    expect(screen.queryByRole("button", { name: t("talkStart", "en") })).toBeNull();
  });

  it("is never mounted in the demo", () => {
    render(<ShootFlow demo />);
    fireEvent.click(button(t("demoStart", "en")));
    expect(voice.mounted).toBe(0);
    expect(screen.queryByRole("button", { name: t("talkStart", "en") })).toBeNull();
  });
});

describe("voice conversation: starting", () => {
  it("states that microphone audio goes to ElevenLabs before anything starts, then starts in the same tap", () => {
    render(<ShootFlow />);
    choosePicture();
    fireEvent.click(button(t("talkStart", "en")));
    expect(screen.getByText(t("talkConsent", "en"))).toBeTruthy();
    expect(screen.getByText(/ElevenLabs/)).toBeTruthy();
    expect(voice.director.start).not.toHaveBeenCalled();

    vi.mocked(coach.unlockAudio!).mockClear();
    fireEvent.click(button(t("talkAgree", "en")));
    expect(coach.unlockAudio).toHaveBeenCalled();
    expect(voice.director.start).toHaveBeenCalledWith("en");
    expect(screen.getByRole("status").textContent).toContain(t("talkStatusDisconnected", "en"));
  });

  it("can be declined without starting", () => {
    render(<ShootFlow />);
    choosePicture();
    fireEvent.click(button(t("talkStart", "en")));
    fireEvent.click(button(t("cancel", "en")));
    expect(screen.queryByText(t("talkConsent", "en"))).toBeNull();
    expect(voice.director.start).not.toHaveBeenCalled();
  });

  it("shows the status, mutes the mic, follows the voice switch, and explains a failure", () => {
    const { rerender } = render(<ShootFlow />);
    choosePicture();
    startTalking();
    expect(voice.director.setOutputEnabled).toHaveBeenLastCalledWith(true);
    fireEvent.click(button(t("voiceOn", "en")));
    expect(voice.director.setOutputEnabled).toHaveBeenLastCalledWith(false);

    fireEvent.click(button(t("talkMute", "en")));
    expect(voice.director.setMicMuted).toHaveBeenCalledWith(true);

    voice.state = { ...voice.state, status: "error", reason: "permission_denied" };
    rerender(<ShootFlow />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t("talkReasonDenied", "en"));
    expect(alert.textContent).toContain(t("talkTouchStillWorks", "en"));
  });

  it("hands the coach the conversation's speech only while it runs, and restarts on a language change", async () => {
    await toIdeas();
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    expect(coach.options?.speech).toBeUndefined();
    startTalking();
    expect(coach.options?.speech).toBe(voice.speech as CoachSpeech);

    act(() => setLang("ro"));
    await waitFor(() => expect(voice.director.start).toHaveBeenLastCalledWith("ro"));
    expect(voice.director.end).toHaveBeenCalled();

    fireEvent.click(button(t("talkStop", "ro")));
    expect(coach.options?.speech).toBeUndefined();
  });
});

describe("voice conversation: actions go through the touch paths", () => {
  it("selectIdea picks an offered idea like the card does, and checks the signal first", async () => {
    await toIdeas();
    startTalking();
    const target = SAMPLE_PLAN_PERSON.ideas[1];

    const aborted = new AbortController();
    aborted.abort();
    let result = await act(async () => voice.actions!.selectIdea(target.id, aborted.signal));
    expect(result).toEqual({ ok: false, reason: "stale" });
    expect(screen.getByText(t("pickShot", "en"))).toBeTruthy();

    result = await act(async () => voice.actions!.selectIdea("not-offered", signal()));
    expect(result).toEqual({ ok: false, reason: "unknown_idea" });

    vi.mocked(coach.cancelPendingCapture!).mockClear();
    result = await act(async () => voice.actions!.selectIdea(target.id, signal()));
    expect(result).toEqual({ ok: true, outcome: "idea_selected" });
    expect(coach.cancelPendingCapture).toHaveBeenCalled();
    expect(coach.options?.idea).toEqual(target);
    expect(button(t("shutter", "en"))).toBeTruthy();
  });

  it("touching an idea card also stops any pending capture first", async () => {
    await toIdeas();
    vi.mocked(coach.cancelPendingCapture!).mockClear();
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[2]);
    expect(coach.cancelPendingCapture).toHaveBeenCalled();
    expect(coach.options?.idea).toEqual(SAMPLE_PLAN_PERSON.ideas[2]);
  });

  it("pauses and resumes through the coach's paused option", async () => {
    await toIdeas();
    startTalking();
    expect(await act(async () => voice.actions!.setCoachingPaused(true, signal()))).toEqual({ ok: false, reason: "wrong_phase" });

    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    vi.mocked(coach.cancelPendingCapture!).mockClear();
    expect(await act(async () => voice.actions!.setCoachingPaused(true, signal()))).toEqual({ ok: true, outcome: "paused" });
    expect(coach.cancelPendingCapture).toHaveBeenCalled();
    expect(coach.options?.paused).toBe(true);
    expect(await act(async () => voice.actions!.requestCapture(signal()))).toEqual({ ok: false, reason: "paused" });

    // The touch control undoes it.
    fireEvent.click(button(t("resume", "en")));
    expect(coach.options?.paused).toBe(false);
  });

  it("requestCapture uses the coach's capture, reaches the result, and ends the conversation after the capture", async () => {
    await toIdeas();
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    startTalking();
    const result = await act(async () => voice.actions!.requestCapture(signal()));
    expect(result).toEqual({ ok: true, outcome: "captured" });
    expect(await screen.findByText(t("rate", "en"))).toBeTruthy();
    expect(voice.director.end).toHaveBeenCalledWith({ afterCapture: true });
    expect(screen.queryByTestId("voice-control")).toBeNull();
  });

  it("ends the conversation without the capture flag when leaving another way", () => {
    render(<ShootFlow />);
    choosePicture();
    startTalking();
    fireEvent.click(button(t("back", "en")));
    expect(voice.director.end).toHaveBeenCalledWith(undefined);
  });
});

describe("voice conversation: what it is told", () => {
  it("sends the offered ideas, no scene facts for sample data, and the coaching state, without images", async () => {
    await toIdeas(true);
    startTalking();
    await waitFor(() => expect(voice.director.updateContext).toHaveBeenCalled());
    let context = vi.mocked(voice.director.updateContext).mock.lastCall![0];
    expect(context).toMatchObject({ phase: "ideas", scene: null, selectedIdeaId: null, coachPhase: null, paused: false, cameraReady: false });
    expect(context.ideas).toEqual(SAMPLE_PLAN_PERSON.ideas.map(({ id, title }) => ({ id, title })));

    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    await waitFor(() => expect(vi.mocked(voice.director.updateContext).mock.lastCall![0].phase).toBe("coach"));
    context = vi.mocked(voice.director.updateContext).mock.lastCall![0];
    expect(context).toMatchObject({ selectedIdeaId: SAMPLE_PLAN_PERSON.ideas[0].id, coachPhase: "coaching", personTracked: true });
    expect(JSON.stringify(context)).not.toContain("data:image");
    expect(JSON.stringify(context)).not.toContain("blob:");
  });

  it("includes the scene facts of a real reading", async () => {
    await toIdeas(false);
    startTalking();
    await waitFor(() => expect(voice.director.updateContext).toHaveBeenCalled());
    expect(vi.mocked(voice.director.updateContext).mock.lastCall![0].scene).toEqual(SAMPLE_PLAN_PERSON.scene);
  });
});
