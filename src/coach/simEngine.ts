/**
 * A scripted stand-in for the real tracker. It walks through the same phases and
 * draws the same guides, so screens can be built, demoed and tested without a
 * person in front of the camera. State it reports is marked `simulated: true`.
 */
import { coverMap, drawGuides, getPoseTemplate, grabFrame, sourceSize, syncCanvas } from "@/vision";
import { phraseAudience, phraseText, type PhraseId } from "./phrases";
import type { CoachCaptureResult, CoachInstruction, CoachSpeechLine, Engine, EngineConfig } from "./types";
import { cancelCoachSpeech, captureRejection, playCoachLine } from "./engineShared";

const LOADING_MS = 600;
const SEARCHING_MS = 1200;
const COACHING_MS = 8000;
const HOLD_MS = 900;
const COUNT_STEP_MS = 800;

const SCRIPT: Record<"solo" | "friend", PhraseId[]> = {
  solo: ["step_back", "move_left", "raise_left_arm", "relax_shoulders", "almost"],
  friend: ["cam_left", "cam_up", "raise_left_arm", "relax_shoulders", "almost"],
};

export function createSimEngine(cfg: EngineConfig): Engine {
  const template = cfg.idea.subject ? getPoseTemplate(cfg.idea.subject.poseTemplateId) : undefined;
  const script = SCRIPT[cfg.mode];
  let raf = 0;
  let startedAt = 0;
  let stopped = false;
  let capturing = false;
  let captured = false;
  let lastSpoken: PhraseId | null = null;
  let lastScore = 0;

  const instruction = (id: PhraseId): CoachInstruction => ({
    id,
    text: phraseText(id, cfg.lang),
    to: phraseAudience(id),
  });

  const speak = (id: PhraseId, kind: CoachSpeechLine["kind"] = "correction") => {
    if (!cfg.voice || lastSpoken === id) return;
    lastSpoken = id;
    playCoachLine(cfg, instruction(id), kind);
  };

  const draw = (score: number) => {
    const canvas = cfg.overlay;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = syncCanvas(canvas);
    const size = sourceSize(cfg.source);
    const map = coverMap(size.width || width, size.height || height, width, height);
    drawGuides(ctx, { map, targetBox: cfg.idea.framing.subjectBox, ghost: template?.points, score });
  };

  const capture = async (manual: boolean, signal?: AbortSignal): Promise<CoachCaptureResult> => {
    const rejection = captureRejection(capturing, captured, stopped, signal);
    if (rejection) return rejection;
    capturing = true;
    cancelCoachSpeech(cfg);
    cancelAnimationFrame(raf);
    try {
      const full = await grabFrame(cfg.source, { mirrored: cfg.mirrored, quality: 0.92 });
      const small = await grabFrame(cfg.source, { mirrored: cfg.mirrored, maxSide: 1024, quality: 0.85 });
      if (stopped || signal?.aborted) {
        capturing = false;
        if (!stopped) {
          raf = requestAnimationFrame(tick);
        }
        return { ok: false, reason: "stale" };
      }
      const total = Math.round(lastScore);
      cfg.emit({ phase: "captured", countdown: null, instruction: instruction("got_it") });
      captured = true;
      speak("got_it", "capture");
      cfg.onCapture({
        blob: full.blob,
        dataUrl: small.dataUrl,
        width: full.width,
        height: full.height,
        manual,
        score: {
          total,
          framing: Math.min(100, total + 4),
          level: null,
          pose: template ? Math.max(0, total - 3) : null,
          crop: null,
          light: null,
        },
      });
      return { ok: true, outcome: "captured" };
    } catch {
      if (stopped) return { ok: false, reason: "stale" };
      capturing = false;
      if (manual) raf = requestAnimationFrame(tick);
      if (signal?.aborted) return { ok: false, reason: "stale" };
      cfg.emit({ phase: "error", countdown: null, error: "capture_failed" });
      return { ok: false, reason: "capture_failed" };
    }
  };

  const tick = (now: number) => {
    if (stopped || capturing) return;
    if (!startedAt) startedAt = now;
    const t = now - startedAt;

    if (t < LOADING_MS) {
      cfg.emit({ phase: "loading", simulated: true });
    } else if (t < LOADING_MS + SEARCHING_MS) {
      cfg.emit({ phase: "searching", personVisible: false, instruction: instruction("step_in"), simulated: true });
      speak("step_in");
    } else if (t < LOADING_MS + SEARCHING_MS + COACHING_MS) {
      const u = (t - LOADING_MS - SEARCHING_MS) / COACHING_MS;
      const eased = 1 - Math.pow(1 - u, 2);
      lastScore = 32 + 56 * eased + Math.sin(now / 260) * 2.5;
      const id = script[Math.min(script.length - 1, Math.floor(u * script.length))];
      cfg.emit({
        phase: "coaching",
        personVisible: true,
        score: Math.round(lastScore),
        parts: { pose: template ? Math.round(lastScore - 3) : null, framing: Math.round(lastScore + 4), level: null },
        instruction: instruction(id),
        countdown: null,
        fps: 30,
        simulated: true,
      });
      speak(id);
    } else {
      const afterCoach = t - LOADING_MS - SEARCHING_MS - COACHING_MS;
      lastScore = 91;
      if (afterCoach < HOLD_MS || cfg.autoCapture === false) {
        cfg.emit({ phase: "holding", score: 91, instruction: instruction("hold"), countdown: null });
        speak("hold", "countdown");
      } else {
        const step = Math.floor((afterCoach - HOLD_MS) / COUNT_STEP_MS);
        if (step >= 3) {
          void capture(false);
          return;
        }
        const id = (["three", "two", "one"] as const)[step];
        cfg.emit({ phase: "countdown", score: 91, countdown: 3 - step, instruction: instruction(id) });
        speak(id, "countdown");
      }
    }

    draw(lastScore);
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      stopped = false;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      cancelCoachSpeech(cfg);
      const ctx = cfg.overlay?.getContext("2d");
      if (ctx && cfg.overlay) ctx.clearRect(0, 0, cfg.overlay.width, cfg.overlay.height);
    },
    captureNow(signal) {
      return capture(true, signal);
    },
  };
}
