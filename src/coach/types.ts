import type { CoachMode, Lang, ShotIdea, ShotScore } from "@/lib/contracts";
import type { PhraseId } from "./phrases";

/**
 * loading   – the tracker is starting
 * searching – nobody in the frame yet
 * coaching  – giving corrections
 * holding   – everything matches; waiting a moment to be sure
 * countdown – 3, 2, 1
 * captured  – the photo was taken (onCapture has fired)
 * error     – the camera or the tracker failed; see `error`
 */
export type CoachPhase =
  | "loading"
  | "searching"
  | "coaching"
  | "holding"
  | "countdown"
  | "captured"
  | "error";

export interface CoachInstruction {
  /** A fixed coach line, or "custom" for free text written for this scene. */
  id: PhraseId | "custom";
  /** Already in the session language. */
  text: string;
  /** Who should act on it. In friend mode, show "photographer" lines on screen. */
  to: "subject" | "photographer" | "anyone";
}

export interface CoachState {
  phase: CoachPhase;
  /** Overall match, 0–100. */
  score: number;
  parts: { pose: number | null; framing: number | null; level: number | null };
  /** The one thing to fix right now, or null when there is nothing to say. */
  instruction: CoachInstruction | null;
  /** 3, 2, 1 during the countdown, otherwise null. */
  countdown: number | null;
  personVisible: boolean;
  fps: number;
  /** true when the scripted tracker is running instead of the real one. */
  simulated: boolean;
  /**
   * Set when phase is "error". "tracker_unavailable" means live tracking could not
   * start on this device: the guides are still drawn and captureNow() still works.
   */
  error: string | null;
}

export interface CapturedShot {
  /** Full-resolution JPEG for saving and sharing. */
  blob: Blob;
  /** At most 1024 px on the long side: for display and for the API. */
  dataUrl: string;
  width: number;
  height: number;
  score: ShotScore;
  /** true when the shutter was pressed instead of waiting for a match. */
  manual: boolean;
}

export interface CoachSessionOptions {
  /** The playing camera element, or null while it is not ready. */
  video: HTMLVideoElement | null;
  /**
   * A picture to coach on when there is no camera (desktop, demos, tests): a data
   * URL, blob URL or address. Ignored when `video` is given.
   */
  still?: string | null;
  /** A canvas covering the video. The coach draws its guides here. May be null. */
  overlay: HTMLCanvasElement | null;
  idea: ShotIdea;
  mode: CoachMode;
  lang: Lang;
  /** true when the preview is mirrored (front camera). */
  mirrored?: boolean;
  /** Speak corrections aloud. Call unlockAudio() from a tap first. */
  voice?: boolean;
  /** Stop coaching without tearing the session down. */
  paused?: boolean;
  /**
   * "auto" (default) tracks the real person in front of the camera.
   * "sim" runs a scripted session: use it for demos and tests without a person.
   */
  engine?: "auto" | "sim";
  onCapture: (shot: CapturedShot) => void;
}

export interface CoachSession extends CoachState {
  /** Take the photo now, without waiting for a match. */
  captureNow: () => void;
  /** Start coaching the same idea again after a capture. */
  restart: () => void;
}

/** What an engine needs to run. Engines push state into `emit`. */
export interface EngineConfig {
  /** The live camera, or a loaded picture standing in for it. */
  source: HTMLVideoElement | HTMLImageElement;
  overlay: HTMLCanvasElement | null;
  idea: ShotIdea;
  mode: CoachMode;
  lang: Lang;
  mirrored: boolean;
  voice: boolean;
  emit: (patch: Partial<CoachState>) => void;
  onCapture: (shot: CapturedShot) => void;
}

export interface Engine {
  start(): void;
  stop(): void;
  captureNow(): void;
}

export const INITIAL_COACH_STATE: CoachState = {
  phase: "loading",
  score: 0,
  parts: { pose: null, framing: null, level: null },
  instruction: null,
  countdown: null,
  personVisible: false,
  fps: 0,
  simulated: false,
  error: null,
};
