/**
 * The real coach for ideas with a person: tracks the body on the device every
 * frame, compares it with the idea, lets the brain decide, speaks, draws the
 * guides, and takes the photo when everything matches.
 */
import type { Box, PosePointName } from "@/lib/contracts";
import {
  anchoredBox,
  bodyAngles3d,
  computeShotScore,
  createFaceTracker,
  coverMap,
  createPoseTracker,
  drawGuides,
  getPoseTemplate,
  grabFrame,
  hasUpperBody,
  matchAll,
  sourceSize,
  syncCanvas,
  watchLevel,
  type FaceSignals,
  type FaceTracker,
  type LivePoints,
  type TrackedPose,
} from "@/vision";
import { getStillTracker } from "@/vision/score";
import { maskCoverage } from "@/vision/silhouette";
import type { PoseTracker } from "@/vision/tracker";
import { CoachBrain, levelScore } from "./brain";
import { limbForPhrase } from "./limbs";
import { cancelCoachSpeech, captureRejection, clearOverlay, createRecorder, playCoachLine, toInstruction } from "./engineShared";
import type { CoachCaptureResult, Engine, EngineConfig } from "./types";

const MIN_FRAME_MS = 30;
const SMOOTHING = 0.5;
const KEEP_MISSING_MS = 250;
/** Face tracking only runs near a match, every other frame, to save the phone's power. */
const FACE_FROM_SCORE = 70;
const FACE_KEEP_MS = 600;
/** Below this frame rate the silhouette glow is skipped and only the skeleton is drawn. */
const MIN_FPS_FOR_OUTLINE = 18;
/** How quickly the target shape follows the person (share of the gap closed per frame). */
const FOLLOW = 0.3;

const easeBox = (from: Box, to: Box, k: number): Box => ({
  x: from.x + k * (to.x - from.x),
  y: from.y + k * (to.y - from.y),
  w: from.w + k * (to.w - from.w),
  h: from.h + k * (to.h - from.h),
});

export function createPoseEngine(cfg: EngineConfig): Engine {
  // A target taken from an AI preview replaces the template and the planner's box.
  const template = cfg.target ? { points: cfg.target.points } : getPoseTemplate(cfg.idea.subject?.poseTemplateId);
  // A pose that also works as an upper-body pose (tagged half-body) does not send a seated or close person back.
  const framingOptions = { halfBody: !cfg.target && getPoseTemplate(cfg.idea.subject?.poseTemplateId).tags.includes("half-body") };
  const box = cfg.target?.box ?? cfg.idea.framing.subjectBox;
  const brain = new CoachBrain({ mode: cfg.mode, expectPose: Boolean(cfg.idea.subject), style: cfg.idea.style });
  const recorder = createRecorder(cfg);
  const isVideo = cfg.source instanceof HTMLVideoElement;

  let tracker: PoseTracker | null = null;
  let faceTracker: FaceTracker | null = null;
  let face: FaceSignals | null = null;
  let faceAt = 0;
  let frame = 0;
  let lastScore = 0;
  let lastPhase = "loading";
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
  /** Where the target shape is drawn: on the person's torso, eased between frames. null = at the idea's box. */
  let ghostBox: Box | null = null;

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

  const draw = (
    points: LivePoints | null,
    score: number,
    pose: TrackedPose | null = null,
    highlight: ReturnType<typeof limbForPhrase>[] = [],
    matched = false,
  ) => {
    const canvas = cfg.overlay;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const view = syncCanvas(canvas);
    const size = sourceSize(cfg.source);
    drawGuides(ctx, {
      map: coverMap(size.width || view.width, size.height || view.height, view.width, view.height),
      targetBox: box,
      ghostBox: points ? (ghostBox ?? undefined) : undefined,
      ghost: cfg.idea.subject ? template.points : undefined,
      live: points ?? undefined,
      score,
      levelErrorDeg: cfg.mode === "friend" ? levelError : undefined,
      silhouette: points && (!isVideo || fps >= MIN_FPS_FOR_OUTLINE) ? pose?.mask : undefined,
      targetSilhouette: cfg.target?.silhouette,
      highlight: highlight.filter((limb): limb is NonNullable<typeof limb> => limb !== null),
      matched,
    });
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
      const size = sourceSize(cfg.source);
      const score = computeShotScore({
        pose: lastPose,
        idea: cfg.idea,
        mode: cfg.mode,
        aspect: size.width / Math.max(1, size.height),
        level: levelScore(levelError),
        image: cfg.source,
        target: cfg.target ? { points: template.points, box } : undefined,
      });
      captured = true;
      cfg.emit({ phase: "captured", countdown: null, instruction: toInstruction("got_it", cfg), error: null });
      playCoachLine(cfg, toInstruction("got_it", cfg), "capture");
      recorder.flush(manual ? "captured-manually" : "captured");
      cfg.onCapture({
        blob: full.blob,
        dataUrl: small.dataUrl,
        width: full.width,
        height: full.height,
        score,
        manual,
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
    // Shoulders are enough: with the hips out of sight (sitting, a shot cut at the waist) the torso is estimated.
    const visible = hasUpperBody(points);
    const aspect = size.width / size.height;
    const measured = visible ? matchAll(points, template.points, box, aspect, cfg.mode, pose?.world, framingOptions) : { pose: null, framing: null };
    // The target shape stands on the person: same torso place and size, so only the limbs differ.
    const anchored = visible ? anchoredBox(points, template.points, aspect) : null;
    ghostBox = anchored ? (ghostBox ? easeBox(ghostBox, anchored, FOLLOW) : anchored) : null;

    // Face signals near a match only, every other frame; keep the last reading briefly.
    frame += 1;
    const nearMatch = lastScore >= FACE_FROM_SCORE || lastPhase === "holding" || lastPhase === "countdown";
    if (faceTracker && visible && nearMatch && frame % 2 === 0) {
      try {
        face = faceTracker.detectVideo(cfg.source as HTMLVideoElement, now);
        faceAt = now;
      } catch {
        face = null;
      }
    } else if (now - faceAt > FACE_KEEP_MS) {
      face = null;
    }

    const decision = brain.update({
      now,
      personVisible: visible,
      pose: measured.pose,
      framing: measured.framing,
      levelError,
      face,
    });
    lastScore = decision.score;
    lastPhase = decision.phase;

    if (decision.capture) {
      void capture(false);
      return;
    }
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
      debug: {
        model: tracker ? tracker.model : isVideo ? null : "still",
        ...roundAngles(bodyAngles3d(pose?.world)),
        eyesOpen: roundTo(face?.eyesOpen, 2),
        smile: roundTo(face?.smile, 2),
        headYawDeg: roundTo(face?.yawDeg, 0),
        headPitchDeg: roundTo(face?.pitchDeg, 0),
        silhouette: Boolean(pose?.mask),
        outlineCoverage: pose?.mask ? Math.round(maskCoverage(pose.mask) * 100) : null,
      },
    });
    if (decision.speak) {
      const kind = decision.phase === "holding" || decision.phase === "countdown" ? "countdown" : "correction";
      playCoachLine(cfg, toInstruction(decision.speak, cfg), kind);
    }
    recorder.sample(now, {
      score: decision.score,
      pose: decision.parts.pose,
      framing: decision.parts.framing,
      instruction: decision.instruction,
      fps: Math.round(fps),
    });
    const highlight = decision.phase === "coaching" ? [limbForPhrase(decision.instruction)] : [];
    const matched = decision.phase === "holding" || decision.phase === "countdown";
    draw(visible ? points : null, decision.score, pose, highlight, matched);
  };

  const boot = async () => {
    cfg.emit({ phase: "loading", simulated: false, error: null });
    try {
      if (isVideo) {
        tracker = await createPoseTracker();
        // Optional: face tracking. Coaching works without it.
        faceTracker = await createFaceTracker().catch(() => null);
      } else {
        stillPose = (await getStillTracker()).detect(cfg.source as HTMLImageElement);
      }
    } catch {
      trackerFailed = true;
      if (!stopped && !captured) cfg.emit({ phase: "error", error: "tracker_unavailable" });
    }
    if (stopped) {
      tracker?.close();
      tracker = null;
      faceTracker?.close();
      faceTracker = null;
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
      faceTracker?.close();
      faceTracker = null;
      cancelCoachSpeech(cfg);
      clearOverlay(cfg.overlay);
      if (!captured) recorder.flush("abandoned");
    },
    captureNow(signal) {
      return capture(true, signal);
    },
  };
}

function roundTo(value: number | null | undefined, digits: number): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function roundAngles(a: { yawDeg: number | null; leanDeg: number | null }): { bodyYawDeg: number | null; leanDeg: number | null } {
  return { bodyYawDeg: roundTo(a.yawDeg, 0), leanDeg: roundTo(a.leanDeg, 0) };
}
