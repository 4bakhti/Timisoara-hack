/**
 * Body tracking on the device, using MediaPipe's Pose Landmarker.
 *
 * Nothing is sent anywhere: the model runs in the browser. The library is loaded
 * on first use so it never slows down the first screen.
 */
import type { Point2, PosePointName } from "@/lib/contracts";
import { POSE_POINT_NAMES } from "@/lib/contracts";
import type { LivePoints } from "./geometry";
import type { PoseModelName, SilhouetteMask, WorldPoints } from "./types";

type Vision = typeof import("@mediapipe/tasks-vision");
type Landmarker = import("@mediapipe/tasks-vision").PoseLandmarker;

const WASM_BASE = "/mediapipe/wasm";
/** Served by the app when the file has been added to public/mediapipe/. */
const LOCAL_MODEL = "/mediapipe/pose_landmarker_lite.task";
const REMOTE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

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
  /** Real 3D positions in metres (MediaPipe world landmarks). TO BUILD (Person A). */
  world?: WorldPoints;
  /** Where the person is, as a small mask. TO BUILD (Person A); only on some frames is fine. */
  mask?: SilhouetteMask;
}

export interface PoseTracker {
  /** Call once per video frame, with increasing timestamps (ms). */
  detectVideo(video: HTMLVideoElement, timeMs: number): TrackedPose | null;
  /** Which model is running now. TO BUILD (Person A): start on "full", drop to "lite" when the phone is too slow. */
  readonly model: PoseModelName;
  close(): void;
}

export interface StillTracker {
  detect(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap): TrackedPose | null;
  close(): void;
}

let visionModule: Promise<Vision> | null = null;
let modelPath: Promise<string> | null = null;

function loadVision(): Promise<Vision> {
  visionModule ??= import("@mediapipe/tasks-vision");
  return visionModule;
}

function resolveModel(): Promise<string> {
  modelPath ??= fetch(LOCAL_MODEL, { method: "HEAD" })
    .then((res) => (res.ok ? LOCAL_MODEL : REMOTE_MODEL))
    .catch(() => REMOTE_MODEL);
  return modelPath;
}

async function createLandmarker(runningMode: "VIDEO" | "IMAGE"): Promise<Landmarker> {
  const vision = await loadVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const modelAssetPath = await resolveModel();
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

type RawLandmark = { x: number; y: number; visibility?: number };

function toTrackedPose(landmarks: RawLandmark[] | undefined): TrackedPose | null {
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
  return { points, all, visibility };
}

/** Tracker for live video. Create one per coaching session and close it afterwards. */
export async function createPoseTracker(): Promise<PoseTracker> {
  const landmarker = await createLandmarker("VIDEO");
  let lastTime = -1;
  return {
    detectVideo(video, timeMs) {
      // Timestamps must strictly increase.
      const t = timeMs <= lastTime ? lastTime + 1 : timeMs;
      lastTime = t;
      return toTrackedPose(landmarker.detectForVideo(video, t).landmarks[0]);
    },
    model: "lite",
    close: () => landmarker.close(),
  };
}

export interface StillTrackerOptions {
  /** Also return the person's mask (needed for target silhouettes from AI previews). TO BUILD (Person A). */
  withMask?: boolean;
}

/** Tracker for single photos (the "before" picture, the lab, demo stills). */
export async function createStillTracker(options: StillTrackerOptions = {}): Promise<StillTracker> {
  void options;
  const landmarker = await createLandmarker("IMAGE");
  return {
    detect: (image) => toTrackedPose(landmarker.detect(image).landmarks[0]),
    close: () => landmarker.close(),
  };
}

/** true when the points include a usable torso (both shoulders and both hips). */
export function hasTorso(points: LivePoints): boolean {
  return Boolean(points.lShoulder && points.rShoulder && points.lHip && points.rHip);
}
