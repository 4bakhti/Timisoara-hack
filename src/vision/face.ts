/** On-device face tracking for the coach. */
import type { Category, Matrix } from "@mediapipe/tasks-vision";
import type { FaceSignals } from "./types";

const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

export interface FaceTracker {
  /** Call with increasing timestamps (ms). Returns null when no face is found. */
  detectVideo(video: HTMLVideoElement, timeMs: number): FaceSignals | null;
  close(): void;
}

export function readFaceSignals(
  categories: readonly Pick<Category, "categoryName" | "score">[],
  matrix?: Matrix,
): FaceSignals {
  const score = (name: string) => categories.find((category) => category.categoryName === name)?.score;
  const leftBlink = score("eyeBlinkLeft");
  const rightBlink = score("eyeBlinkRight");
  const leftSmile = score("mouthSmileLeft");
  const rightSmile = score("mouthSmileRight");

  let yawDeg: number | null = null;
  let pitchDeg: number | null = null;
  if (matrix?.rows === 4 && matrix.columns === 4 && matrix.data.length === 16) {
    // MediaPipe packs the face transform column-major. Column 2 is the
    // transformed forward axis (+Z in the canonical face). +X is image right
    // (the subject's left when facing us), and +Y is up, so pitch is chin-up.
    const [, , , , , , , , x, y, z] = matrix.data;
    const horizontal = Math.hypot(x, z);
    if (Number.isFinite(horizontal) && Number.isFinite(y) && Math.hypot(horizontal, y) > 0) {
      yawDeg = horizontal > 1e-6 ? (Math.atan2(x, z) * 180) / Math.PI : null;
      pitchDeg = (Math.atan2(y, horizontal) * 180) / Math.PI;
    }
  }
  return {
    eyesOpen: leftBlink === undefined || rightBlink === undefined ? null : 1 - Math.max(leftBlink, rightBlink),
    smile: leftSmile === undefined || rightSmile === undefined ? null : (leftSmile + rightSmile) / 2,
    yawDeg,
    pitchDeg,
  };
}

/** Returns null when face tracking cannot be loaded on this device. */
export async function createFaceTracker(): Promise<FaceTracker | null> {
  try {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });

    const landmarker = await create("GPU").catch(() => create("CPU"));
    return {
      detectVideo(video, timeMs) {
        const result = landmarker.detectForVideo(video, timeMs);
        if (!result.faceLandmarks[0]?.length) return null;
        return readFaceSignals(result.faceBlendshapes[0]?.categories ?? [], result.facialTransformationMatrixes[0]);
      },
      close: () => landmarker.close(),
    };
  } catch {
    return null;
  }
}
