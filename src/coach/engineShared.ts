/** Small pieces every engine uses: instruction text, usage numbers, clearing the overlay. */
import { api } from "@/lib/api";
import { APP_VERSION } from "@/lib/brand";
import type { CoachEvent, EventsRequest } from "@/lib/contracts";
import { phraseAudience, phraseText, type PhraseId } from "./phrases";
import type { CoachCaptureResult, CoachInstruction, CoachSpeechLine, EngineConfig } from "./types";
import { speakInstruction, stopSpeaking } from "./voice";

export function toInstruction(id: PhraseId | null, cfg: Pick<EngineConfig, "lang">): CoachInstruction | null {
  return id ? { id, text: phraseText(id, cfg.lang), to: phraseAudience(id) } : null;
}

export function customInstruction(text: string): CoachInstruction {
  return { id: "custom", text, to: "photographer" };
}

export function playCoachLine(cfg: EngineConfig, instruction: CoachInstruction | null, kind: CoachSpeechLine["kind"] = "correction") {
  if (!cfg.voice || !instruction) return;
  if (cfg.speech) {
    cfg.speech.say({ instruction, kind, ideaId: cfg.idea.id, lang: cfg.lang });
  } else {
    void speakInstruction(instruction, cfg.lang, { localOnly: kind !== "correction" });
  }
}

export function cancelCoachSpeech({ speech }: Pick<EngineConfig, "speech">) {
  if (speech) speech.cancel();
  else stopSpeaking();
}

export function captureRejection(capturing: boolean, captured: boolean, stopped: boolean, signal?: AbortSignal): CoachCaptureResult | null {
  if (signal?.aborted || stopped) return { ok: false, reason: "stale" };
  if (captured) return { ok: false, reason: "already_captured" };
  if (capturing) return { ok: false, reason: "capture_in_progress" };
  return null;
}

export function clearOverlay(canvas: HTMLCanvasElement | null): void {
  const ctx = canvas?.getContext("2d");
  if (ctx && canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface Recorder {
  /** Call every frame; it keeps about two samples a second. */
  sample(now: number, event: Omit<CoachEvent, "t">): void;
  /** Sends what was recorded. Safe to call more than once; only the first call sends. */
  flush(outcome: NonNullable<EventsRequest["outcome"]>): void;
}

/** Records how a coaching session went, for the results dashboard. No images, no personal data. */
export function createRecorder(cfg: Pick<EngineConfig, "idea" | "mode">): Recorder {
  const sessionId = newSessionId();
  const events: CoachEvent[] = [];
  let startedAt: number | null = null;
  let lastAt = -Infinity;
  let sent = false;
  return {
    sample(now, event) {
      startedAt ??= now;
      if (now - lastAt < 500 || events.length >= 600) return;
      lastAt = now;
      events.push({ t: Math.round(now - startedAt), ...event });
    },
    flush(outcome) {
      if (sent || events.length === 0) return;
      sent = true;
      void api.events({
        sessionId,
        appVersion: APP_VERSION,
        ideaStyle: cfg.idea.style,
        mode: cfg.mode,
        outcome,
        events,
      });
    },
  };
}
