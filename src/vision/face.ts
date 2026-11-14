/**
 * Face signals for the coach: are the eyes open, is the person smiling, where is
 * the head pointing. Runs on the device like the body tracker.
 *
 * TO BUILD (Person C): replace the body of createFaceTracker with MediaPipe's
 * Face Landmarker (runningMode VIDEO, numFaces 1, outputFaceBlendshapes and
 * outputFacialTransformationMatrixes on). Read eyesOpen from the eyeBlink
 * blendshapes, smile from mouthSmile, and yaw/pitch from the transformation
 * matrix. Return null if the model cannot load. The coach already calls this
 * and handles null.
 */
import type { FaceSignals } from "./types";

export interface FaceTracker {
  /** Call with increasing timestamps (ms). Returns null when no face is found. */
  detectVideo(video: HTMLVideoElement, timeMs: number): FaceSignals | null;
  close(): void;
}

/** Returns null while face tracking is not available on this device (or not built yet). */
export async function createFaceTracker(): Promise<FaceTracker | null> {
  return null;
}
