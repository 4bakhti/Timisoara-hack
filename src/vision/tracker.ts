/**
 * Body tracking on the device, using MediaPipe's Pose Landmarker.
 *
 * Nothing is sent anywhere: the models run in the browser. The library is loaded
 * on first use so it never slows down the first screen.
 *
 * Model choice: a phone starts on the "lite" pose model, which loads quickly.
 * When the phone keeps up easily, the tracker upgrades itself to the more accurate
 * "full" model in the background. If "full" turns out to be too slow, it drops
 * back to "lite" and stays there. The choice is remembered on the device.
 *
 * Each result also carries the 3D ("world") points and, every few frames, a small
 * mask of where the person is, used to draw their outline. The mask comes from
 * MediaPipe's small person segmenter running on the CPU: masks read back from the
 * GPU came back empty in testing, so the pose model keeps the GPU and the
 * segmenter (250 KB, on a 256 px copy of the frame) stays on the CPU.
 */
import type { MPMask } from "@mediapipe/tasks-vision";
import type { Point2, PosePointName } from "@/lib/contracts";
import { POSE_POINT_NAMES } from "@/lib/contracts";
import type { LivePoints } from "./geometry";
import { downscaleMask } from "./silhouette";
import type { PoseModelName, SilhouetteMask, WorldPoints } from "./types";

type Vision = typeof import("@mediapipe/tasks-vision");
type Landmarker = import("@mediapipe/tasks-vision").PoseLandmarker;
type Segmenter = import("@mediapipe/tasks-vision").ImageSegmenter;
type RawLandmark = { x: number; y: number; z?: number; visibility?: number };

const WASM_BASE = "/mediapipe/wasm";

const REMOTE_MODEL: Record<PoseModelName, string> = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
};
/** Served by the app instead, when the file has been added to public/mediapipe/. */
const LOCAL_MODEL = (model: PoseModelName) => `/mediapipe/pose_landmarker_${model}.task`;

const REMOTE_SEGMENTER =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const LOCAL_SEGMENTER = "/mediapipe/selfie_segmenter.tflite";

/**
 * The frame given to the pose model is scaled so its long side is at most this.
 * The model looks at a 256 px crop of the person anyway, so accuracy is unchanged.
 */
const INPUT_MAX_SIDE = 512;
/** The segmenter works on an even smaller copy. */
const MASK_INPUT_MAX_SIDE = 256;
/** A fresh outline mask every this many frames; the last one is reused in between. */
const MASK_EVERY = 3;

/** Index of each of our points in MediaPipe's 33-landmark output. */
const INDEX: Record<PosePointName, number> = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lKnee: 25,
  rKnee: 26,
  lAnkle: 27,
  rAnkle: 28,
};

/** Shoulders and hips are kept even when half hidden: the model estimates them well. */
const TORSO = new Set<PosePointName>(["lShoulder", "rShoulder", "lHip", "rHip"]);

export interface TrackedPose {
  /** Image-normalised points (0–1). Only points the model is confident about. */
  points: LivePoints;
  /** Raw points for every joint, even uncertain or off-frame ones. For crop checks. */
  all: Record<PosePointName, Point2>;
  visibility: Record<PosePointName, number>;
  /** Real 3D positions in metres (MediaPipe world landmarks), origin between the hips. */
  world?: WorldPoints;
  /** Where the person is, as a small mask (refreshed every few frames). */
  mask?: SilhouetteMask;
}

export interface PoseTracker {
  /** Call once per video frame, with increasing timestamps (ms). */
  detectVideo(video: HTMLVideoElement, timeMs: number): TrackedPose | null;
  /** Which pose model is running now. */
  readonly model: PoseModelName;
  close(): void;
}

export interface StillTracker {
  detect(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap): TrackedPose | null;
  close(): void;
}

export interface StillTrackerOptions {
  /** Also return the person's mask (needed for target silhouettes from AI previews). */
  withMask?: boolean;
  /** Defaults to the model this device runs comfortably. */
  model?: PoseModelName;
}

/* ----------------------------------------------------------- model choice */

export interface ModelStats {
  /** How many recent frames were timed. */
  samples: number;
  /** Their average pose detection time in ms. */
  avgMs: number;
  /** true once "full" has proved too slow on this device. */
  fullTooSlow: boolean;
}

/** Upgrade to "full" when "lite" takes at most this long per frame. */
export const UPGRADE_BELOW_MS = 18;
/** Drop back to "lite" when "full" takes longer than this per frame (about 25 fps left for the rest). */
export const DOWNGRADE_ABOVE_MS = 40;
/** Frames to time before deciding anything. */
export const MIN_SAMPLES = 45;

/** Which model to run next, given how the current one is doing. Pure; see the tests. */
export function nextModel(current: PoseModelName, stats: ModelStats): PoseModelName {
  if (stats.samples < MIN_SAMPLES) return current;
  if (current === "lite" && !stats.fullTooSlow && stats.avgMs <= UPGRADE_BELOW_MS) return "full";
  if (current === "full" && stats.avgMs > DOWNGRADE_ABOVE_MS) return "lite";
  return current;
}

const PREFERENCE_KEY = "framewise.poseModel";
type Preference = "lite" | "full" | "lite-only";

function readPreference(): Preference {
  try {
    const value = window.localStorage.getItem(PREFERENCE_KEY);
    return value === "full" || value === "lite-only" ? value : "lite";
  } catch {
    return "lite";
  }
}

function writePreference(value: Preference): void {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, value);
  } catch {
    // Private mode or blocked storage: the device simply starts on "lite" next time.
  }
}

/** Picks the "person" mask from a segmenter's outputs, using its labels when it has them. */
export function personMaskIndex(labels: string[], maskCount: number): number {
  const byName = labels.findIndex((label) => /person|selfie|foreground|human/i.test(label));
  if (byName >= 0 && byName < maskCount) return byName;
  return maskCount >= 2 ? 1 : 0;
}

/* --------------------------------------------------------------- loading */

let visionModule: Promise<Vision> | null = null;
const assetPath = new Map<string, Promise<string>>();

function loadVision(): Promise<Vision> {
  visionModule ??= import("@mediapipe/tasks-vision");
  return visionModule;
}

/** The app's own copy when it serves one, otherwise Google's. */
function resolveAsset(local: string, remote: string): Promise<string> {
  let path = assetPath.get(local);
  if (!path) {
    path = fetch(local, { method: "HEAD" })
      .then((res) => (res.ok ? local : remote))
      .catch(() => remote);
    assetPath.set(local, path);
  }
  return path;
}

async function createLandmarker(runningMode: "VIDEO" | "IMAGE", model: PoseModelName): Promise<Landmarker> {
  const vision = await loadVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const modelAssetPath = await resolveAsset(LOCAL_MODEL(model), REMOTE_MODEL[model]);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await vision.PoseLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    // Older phones and some browsers have no usable GPU path.
    return vision.PoseLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

async function createSegmenter(runningMode: "VIDEO" | "IMAGE"): Promise<Segmenter> {
  const vision = await loadVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const modelAssetPath = await resolveAsset(LOCAL_SEGMENTER, REMOTE_SEGMENTER);
  return vision.ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate: "CPU" },
    runningMode,
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
}

/* ------------------------------------------------------------- conversion */

function toTrackedPose(landmarks: RawLandmark[] | undefined, worldLandmarks?: RawLandmark[]): TrackedPose | null {
  if (!landmarks || landmarks.length < 29) return null;
  const points: LivePoints = {};
  const all = {} as Record<PosePointName, Point2>;
  const visibility = {} as Record<PosePointName, number>;
  for (const name of POSE_POINT_NAMES) {
    const lm = landmarks[INDEX[name]];
    const v = lm.visibility ?? 0;
    all[name] = [lm.x, lm.y];
    visibility[name] = v;
    if (TORSO.has(name)) {
      if (v >= 0.2 && lm.y < 1.5) points[name] = [lm.x, lm.y];
    } else if (v >= 0.5 && lm.x > -0.02 && lm.x < 1.02 && lm.y > -0.02 && lm.y < 1.02) {
      points[name] = [lm.x, lm.y];
    }
  }
  const pose: TrackedPose = { points, all, visibility };
  if (worldLandmarks && worldLandmarks.length >= 29) {
    const world: WorldPoints = {};
    for (const name of POSE_POINT_NAMES) {
      const lm = worldLandmarks[INDEX[name]];
      world[name] = [lm.x, lm.y, lm.z ?? 0];
    }
    pose.world = world;
  }
  return pose;
}

/** Reads the person mask inside the segmenter's callback (it is freed right after) and shrinks it. */
function personMask(segmenter: Segmenter, masks: MPMask[] | undefined): SilhouetteMask | undefined {
  if (!masks?.length) return undefined;
  const mask = masks[personMaskIndex(segmenter.getLabels(), masks.length)];
  if (!mask?.width || !mask.height) return undefined;
  try {
    return downscaleMask(mask.getAsFloat32Array(), mask.width, mask.height);
  } catch {
    return undefined;
  }
}

type Frame = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

function frameSize(source: Frame): [number, number] {
  if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
  if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight];
  return [source.width, source.height];
}

/** Draws a frame into a reusable canvas no larger than `maxSide`. */
function createScaler(maxSide: number) {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return (source: Frame): Frame => {
    const [w, h] = frameSize(source);
    const longest = Math.max(w, h);
    if (!w || !h || longest <= maxSide) return source;
    const ratio = maxSide / longest;
    const cw = Math.round(w * ratio);
    const ch = Math.round(h * ratio);
    if (!canvas) {
      canvas = document.createElement("canvas");
      ctx = canvas.getContext("2d", { alpha: false });
    }
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    if (!ctx) return source;
    ctx.drawImage(source, 0, 0, cw, ch);
    return canvas;
  };
}

/* --------------------------------------------------------------- trackers */

/** Tracker for live video. Create one per coaching session and close it afterwards. */
export async function createPoseTracker(): Promise<PoseTracker> {
  const preference = readPreference();
  let model: PoseModelName = preference === "full" ? "full" : "lite";
  let fullTooSlow = preference === "lite-only";
  let active = await createLandmarker("VIDEO", model);

  // The outline is optional: coaching starts without waiting for the segmenter.
  let segmenter: Segmenter | null = null;
  let closed = false;
  createSegmenter("VIDEO")
    .then((s) => {
      if (closed) s.close();
      else segmenter = s;
    })
    .catch(() => undefined);

  const scale = createScaler(INPUT_MAX_SIDE);
  const scaleForMask = createScaler(MASK_INPUT_MAX_SIDE);
  const timings: number[] = [];
  let switching = false;
  let lastTime = -1;
  let frame = 0;
  let lastMask: SilhouetteMask | undefined;

  const switchTo = (next: PoseModelName) => {
    switching = true;
    if (next === "lite") {
      fullTooSlow = true;
      writePreference("lite-only");
    }
    createLandmarker("VIDEO", next)
      .then((landmarker) => {
        if (closed) {
          landmarker.close();
          return;
        }
        const previous = active;
        active = landmarker;
        model = next;
        timings.length = 0;
        previous.close();
        if (next === "full") writePreference("full");
      })
      .catch(() => {
        // Could not load the other model (offline?): keep the one that works.
        if (next === "full") fullTooSlow = true;
      })
      .finally(() => {
        switching = false;
      });
  };

  const record = (ms: number) => {
    timings.push(ms);
    if (timings.length > 60) timings.shift();
    if (switching) return;
    const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    const next = nextModel(model, { samples: timings.length, avgMs, fullTooSlow });
    if (next !== model) switchTo(next);
  };

  return {
    get model() {
      return model;
    },
    detectVideo(video, timeMs) {
      // Timestamps must strictly increase.
      const t = timeMs <= lastTime ? lastTime + 1 : timeMs;
      lastTime = t;
      const out: { pose: TrackedPose | null } = { pose: null };
      const started = performance.now();
      active.detectForVideo(scale(video), t, (result) => {
        out.pose = toTrackedPose(result.landmarks[0], result.worldLandmarks?.[0]);
      });
      // Only the pose model's time decides which model to run.
      record(performance.now() - started);

      const pose = out.pose as TrackedPose | null;
      if (!pose) {
        lastMask = undefined;
      } else if (segmenter && frame % MASK_EVERY === 0) {
        const s = segmenter;
        try {
          s.segmentForVideo(scaleForMask(video), t, (result) => {
            lastMask = personMask(s, result.confidenceMasks);
          });
        } catch {
          lastMask = undefined;
        }
      }
      frame += 1;
      if (pose) pose.mask = lastMask;
      return pose;
    },
    close: () => {
      closed = true;
      active.close();
      segmenter?.close();
      segmenter = null;
    },
  };
}

/** Tracker for single photos (the "before" picture, AI previews, the lab, demo stills). */
export async function createStillTracker(options: StillTrackerOptions = {}): Promise<StillTracker> {
  const model = options.model ?? (readPreference() === "full" ? "full" : "lite");
  const landmarker = await createLandmarker("IMAGE", model);
  const segmenter = options.withMask ? await createSegmenter("IMAGE").catch(() => null) : null;
  const scaleForMask = createScaler(MASK_INPUT_MAX_SIDE * 2);
  return {
    detect(image) {
      const out: { pose: TrackedPose | null } = { pose: null };
      landmarker.detect(image, (result) => {
        out.pose = toTrackedPose(result.landmarks[0], result.worldLandmarks?.[0]);
      });
      const pose = out.pose as TrackedPose | null;
      if (pose && segmenter) {
        try {
          segmenter.segment(scaleForMask(image), (result) => {
            pose.mask = personMask(segmenter, result.confidenceMasks);
          });
        } catch {
          // No outline for this picture; the pose is still usable.
        }
      }
      return pose;
    },
    close: () => {
      landmarker.close();
      segmenter?.close();
    },
  };
}

/** true when the points include a usable torso (both shoulders and both hips). */
export function hasTorso(points: LivePoints): boolean {
  return Boolean(points.lShoulder && points.rShoulder && points.lHip && points.rHip);
}

/**
 * true when the coach can work with what it sees: both shoulders. The hips may
 * be out of sight (sitting at a table, a shot cut at the waist); the torso is
 * then estimated from the shoulders.
 */
export function hasUpperBody(points: LivePoints): boolean {
  return Boolean(points.lShoulder && points.rShoulder);
}
