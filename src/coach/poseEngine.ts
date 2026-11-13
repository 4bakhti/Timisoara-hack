/**
 * The real coach for ideas with a person: tracks the body on the device every
 * frame, compares it with the idea, lets the brain decide, speaks, draws the
 * guides, and takes the photo when everything matches.
 */
import type { PosePointName } from "@/lib/contracts";
import {
  computeShotScore,
  coverMap,
  createPoseTracker,
  drawGuides,
  getPoseTemplate,
  grabFrame,
  hasTorso,
  matchAll,
  sourceSize,
  syncCanvas,
  watchLevel,
  type LivePoints,
  type TrackedPose,
} from "@/vision";
import { getStillTracker } from "@/vision/score";
import type { PoseTracker } from "@/vision/tracker";
import { CoachBrain, levelScore } from "./brain";
import { clearOverlay, createRecorder, toInstruction } from "./engineShared";
import type { Engine, EngineConfig } from "./types";
import { say, stopSpeaking } from "./voice";

const MIN_FRAME_MS = 30;
const SMOOTHING = 0.5;
const KEEP_MISSING_MS = 250;

export function createPoseEngine(cfg: EngineConfig): Engine {
  const template = getPoseTemplate(cfg.idea.subject?.poseTemplateId);
  const box = cfg.idea.framing.subjectBox;
  const brain = new CoachBrain({ mode: cfg.mode, expectPose: Boolean(cfg.idea.subject) });
  const recorder = createRecorder(cfg);
  const isVideo = cfg.source instanceof HTMLVideoElement;

  let tracker: PoseTracker | null = null;
  let stillPose: TrackedPose | null = null;
  let trackerFailed = false;
  let stopLevel: () => void = () => undefined;
  let levelError: number | null = null;

  let raf = 0;
  let stopped = false;
  let capturing = false;
  let captured = false;
  let lastTick = 0;
  let fps = 0;

  let smooth: LivePoints = {};
  const seenAt: Partial<Record<PosePointName, number>> = {};
  let lastPose: TrackedPose | null = null;

  /** Steadies the points between frames and bridges very short dropouts. */
  const smoothPoints = (fresh: LivePoints, now: number): LivePoints => {
    const next: LivePoints = {};
    for (const name of Object.keys({ ...smooth, ...fresh }) as PosePointName[]) {
      const p = fresh[name];
      const old = smooth[name];
      if (p) {
        seenAt[name] = now;
        next[name] = old ? [old[0] + SMOOTHING * (p[0] - old[0]), old[1] + SMOOTHING * (p[1] - old[1])] : p;
      } else if (old && now - (seenAt[name] ?? 0) < KEEP_MISSING_MS) {
        next[name] = old;
      }
    }
    smooth = next;
    return next;
  };

  const draw = (points: LivePoints | null, score: number) => {
    const canvas = cfg.overlay;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const view = syncCanvas(canvas);
    const size = sourceSize(cfg.source);
    drawGuides(ctx, {
      map: coverMap(size.width || view.width, size.height || view.height, view.width, view.height),
      targetBox: box,
      ghost: cfg.idea.subject ? template.points : undefined,
      live: points ?? undefined,
      score,
      levelErrorDeg: cfg.mode === "friend" ? levelError : undefined,
    });
  };

  const capture = async (manual: boolean) => {
    if (capturing || stopped) return;
    capturing = true;
    cancelAnimationFrame(raf);
    try {
      const full = await grabFrame(cfg.source, { mirrored: cfg.mirrored, quality: 0.92 });
      const small = await grabFrame(cfg.source, { mirrored: cfg.mirrored, maxSide: 1024, quality: 0.85 });
      const size = sourceSize(cfg.source);
      const score = computeShotScore({
        pose: lastPose,
        idea: cfg.idea,
        mode: cfg.mode,
        aspect: size.width / Math.max(1, size.height),
        level: levelScore(levelError),
        image: cfg.source,
      });
      captured = true;
      cfg.emit({ phase: "captured", countdown: null, instruction: toInstruction("got_it", cfg), error: null });
      if (manual && cfg.voice) void say("got_it", cfg.lang);
      recorder.flush(manual ? "captured-manually" : "captured");
      cfg.onCapture({
        blob: full.blob,
        dataUrl: small.dataUrl,
        width: full.width,
        height: full.height,
        score,
        manual,
      });
    } catch (err) {
      capturing = false;
      cfg.emit({ phase: "error", error: err instanceof Error ? err.message : "capture_failed" });
    }
  };

  const tick = (now: number) => {
    if (stopped || capturing) return;
    raf = requestAnimationFrame(tick);
    if (now - lastTick < MIN_FRAME_MS) return;
    const elapsed = now - lastTick;
    lastTick = now;
    if (elapsed < 1000) fps = fps ? fps + 0.1 * (1000 / elapsed - fps) : 1000 / elapsed;

    const size = sourceSize(cfg.source);
    if (!size.width || !size.height) return;

    if (trackerFailed) {
      // No live tracking on this device: keep the guides up so the user can line up by eye.
      draw(null, 0);
      return;
    }

    let pose: TrackedPose | null;
    try {
      pose = tracker ? tracker.detectVideo(cfg.source as HTMLVideoElement, now) : stillPose;
    } catch {
      pose = null;
    }
    lastPose = pose;

    const points = smoothPoints(pose?.points ?? {}, now);
    const visible = hasTorso(points);
    const aspect = size.width / size.height;
    const measured = visible ? matchAll(points, template.points, box, aspect, cfg.mode) : { pose: null, framing: null };

    const decision = brain.update({
      now,
      personVisible: visible,
      pose: measured.pose,
      framing: measured.framing,
      levelError,
    });

    cfg.emit({
      phase: decision.phase,
      score: decision.score,
      parts: decision.parts,
      instruction: toInstruction(decision.instruction, cfg),
      countdown: decision.countdown,
      personVisible: visible,
      fps: Math.round(fps),
      simulated: false,
      error: null,
    });
    if (decision.speak && cfg.voice) void say(decision.speak, cfg.lang);
    recorder.sample(now, {
      score: decision.score,
      pose: decision.parts.pose,
      framing: decision.parts.framing,
      instruction: decision.instruction,
      fps: Math.round(fps),
    });
    draw(visible ? points : null, decision.score);
    if (decision.capture) void capture(false);
  };

  const boot = async () => {
    cfg.emit({ phase: "loading", simulated: false, error: null });
    try {
      if (isVideo) {
        tracker = await createPoseTracker();
      } else {
        stillPose = (await getStillTracker()).detect(cfg.source as HTMLImageElement);
      }
    } catch {
      trackerFailed = true;
      cfg.emit({ phase: "error", error: "tracker_unavailable" });
    }
    if (stopped) {
      tracker?.close();
      tracker = null;
      return;
    }
    stopLevel = watchLevel((error) => {
      levelError = error;
    });
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      stopped = false;
      void boot();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      stopLevel();
      tracker?.close();
      tracker = null;
      stopSpeaking();
      clearOverlay(cfg.overlay);
      if (!captured) recorder.flush("abandoned");
    },
    captureNow() {
      void capture(true);
    },
  };
}
