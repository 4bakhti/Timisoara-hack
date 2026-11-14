/**
 * The coach for scenes without a person to track (objects, food, places).
 *
 * There are no body points to measure, so every few seconds a small frame is
 * sent to the server, which answers with how well the framing matches the idea
 * and one correction. The target box and the level line are still drawn live.
 *
 * When the server has no AI key it answers with sample data; then the idea's own
 * instruction is shown and the photo is taken with the shutter button only.
 */
import { api } from "@/lib/api";
import { coverMap, drawGuides, grabFrame, sourceSize, syncCanvas, watchLevel } from "@/vision";
import { levelScore } from "./brain";
import { cancelCoachSpeech, captureRejection, clearOverlay, createRecorder, customInstruction, playCoachLine, toInstruction } from "./engineShared";
import type { PhraseId } from "./phrases";
import type { CoachCaptureResult, CoachInstruction, Engine, EngineConfig } from "./types";

const CHECK_EVERY_MS = 2500;
const READY_MATCH = 85;
const COUNT_STEP_MS = 800;
const COUNT_LINES: PhraseId[] = ["three", "two", "one"];

export function createGuideEngine(cfg: EngineConfig): Engine {
  const recorder = createRecorder(cfg);
  const ownLine = customInstruction(cfg.idea.photographer.say);

  let stopped = false;
  let capturing = false;
  let captured = false;
  let counting = false;
  let checkTimer = 0;
  let countTimer = 0;
  let raf = 0;
  let stopLevel: () => void = () => undefined;
  let levelError: number | null = null;

  /** Last answer from the server. null until the first one, or when it was sample data. */
  let match: number | null = null;
  let goodInARow = 0;
  let instruction: CoachInstruction | null = ownLine;
  let lastSpokenFix: string | null = null;

  const publish = (extra: { phase?: "coaching" | "holding" | "countdown"; countdown?: number | null } = {}) => {
    cfg.emit({
      phase: extra.phase ?? "coaching",
      score: match ?? 0,
      parts: { pose: null, framing: match, level: levelScore(levelError) },
      instruction,
      countdown: extra.countdown ?? null,
      personVisible: false,
      simulated: false,
      error: null,
    });
  };

  const draw = () => {
    if (stopped || capturing) return;
    raf = requestAnimationFrame(draw);
    const canvas = cfg.overlay;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const view = syncCanvas(canvas);
    const size = sourceSize(cfg.source);
    drawGuides(ctx, {
      map: coverMap(size.width || view.width, size.height || view.height, view.width, view.height),
      targetBox: cfg.idea.framing.subjectBox,
      score: match ?? 0,
      levelErrorDeg: levelError,
    });
  };

  const capture = async (manual: boolean, signal?: AbortSignal): Promise<CoachCaptureResult> => {
    const rejection = captureRejection(capturing, captured, stopped, signal);
    if (rejection) return rejection;
    capturing = true;
    cancelCoachSpeech(cfg);
    window.clearTimeout(checkTimer);
    window.clearTimeout(countTimer);
    cancelAnimationFrame(raf);
    try {
      const full = await grabFrame(cfg.source, { mirrored: cfg.mirrored, quality: 0.92 });
      const small = await grabFrame(cfg.source, { mirrored: cfg.mirrored, maxSide: 1024, quality: 0.85 });
      if (stopped || signal?.aborted) {
        capturing = false;
        if (!stopped) {
          counting = false;
          goodInARow = 0;
          checkTimer = window.setTimeout(check, CHECK_EVERY_MS);
          raf = requestAnimationFrame(draw);
        }
        return { ok: false, reason: "stale" };
      }
      const level = levelScore(levelError);
      const measured = [match, level].filter((v): v is number => v !== null);
      const total = measured.length ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : 0;
      captured = true;
      cfg.emit({ phase: "captured", countdown: null, instruction: toInstruction("got_it", cfg) });
      playCoachLine(cfg, toInstruction("got_it", cfg), "capture");
      recorder.flush(manual ? "captured-manually" : "captured");
      cfg.onCapture({
        blob: full.blob,
        dataUrl: small.dataUrl,
        width: full.width,
        height: full.height,
        manual,
        score: { total, framing: match, level, pose: null, crop: null, light: null },
      });
      return { ok: true, outcome: "captured" };
    } catch {
      if (stopped) return { ok: false, reason: "stale" };
      capturing = false;
      counting = false;
      goodInARow = 0;
      if (manual) {
        checkTimer = window.setTimeout(check, CHECK_EVERY_MS);
        raf = requestAnimationFrame(draw);
      }
      if (signal?.aborted) return { ok: false, reason: "stale" };
      cfg.emit({ phase: "error", countdown: null, error: "capture_failed" });
      return { ok: false, reason: "capture_failed" };
    }
  };

  const countDown = (step: number) => {
    if (stopped || capturing) return;
    if (step >= COUNT_LINES.length) {
      void capture(false);
      return;
    }
    instruction = toInstruction(COUNT_LINES[step], cfg);
    publish({ phase: "countdown", countdown: COUNT_LINES.length - step });
    playCoachLine(cfg, instruction, "countdown");
    countTimer = window.setTimeout(() => countDown(step + 1), COUNT_STEP_MS);
  };

  const check = async () => {
    if (stopped || capturing || counting) return;
    try {
      const frame = await grabFrame(cfg.source, { maxSide: 512, quality: 0.7 });
      const answer = await api.guide({ frame: frame.dataUrl, idea: cfg.idea, lang: cfg.lang });
      if (stopped || capturing) return;
      if (answer.mock) {
        goodInARow = 0;
        match = null;
        instruction = ownLine;
      } else {
        match = Math.round(answer.match);
        instruction = answer.fix ? customInstruction(answer.fix) : null;
        goodInARow = match >= READY_MATCH ? goodInARow + 1 : 0;
        recorder.sample(performance.now(), { score: match, framing: match, instruction: answer.fix ? "custom" : null });
        if (goodInARow >= 2) {
          counting = true;
          instruction = toInstruction("hold", cfg);
          publish({ phase: "holding" });
          playCoachLine(cfg, instruction, "countdown");
          countTimer = window.setTimeout(() => countDown(0), COUNT_STEP_MS);
          return;
        }
      }
      publish();
      if (!answer.mock && answer.fix && answer.fix !== lastSpokenFix && cfg.voice && cfg.mode === "solo") {
        lastSpokenFix = answer.fix;
        playCoachLine(cfg, instruction);
      }
    } catch {
      // A failed check is not worth interrupting the user for; try again shortly.
    }
    checkTimer = window.setTimeout(check, CHECK_EVERY_MS);
  };

  return {
    start() {
      stopped = false;
      publish();
      stopLevel = watchLevel((error) => {
        levelError = error;
      });
      raf = requestAnimationFrame(draw);
      checkTimer = window.setTimeout(check, 600);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(checkTimer);
      window.clearTimeout(countTimer);
      cancelAnimationFrame(raf);
      stopLevel();
      cancelCoachSpeech(cfg);
      clearOverlay(cfg.overlay);
      if (!captured) recorder.flush("abandoned");
    },
    captureNow(signal) {
      return capture(true, signal);
    },
  };
}
