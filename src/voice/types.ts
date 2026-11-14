import type { CoachInstruction, CoachPhase } from "@/coach/types";
import type { Lang, SceneRead, ShotIdea } from "@/lib/contracts";

export type VoiceFlowPhase = "intro" | "camera" | "reading" | "ideas" | "coach" | "result";

/** A snapshot of the shooting flow. Include only scene facts from a real analysis. */
export interface VoiceContext {
  lang: Lang;
  phase: VoiceFlowPhase;
  ideas: readonly Pick<ShotIdea, "id" | "title">[];
  selectedIdeaId: string | null;
  scene: SceneRead | null;
  coachPhase: CoachPhase | null;
  instruction: CoachInstruction | null;
  personTracked: boolean;
  paused: boolean;
  cameraReady: boolean;
  /** Unix time in milliseconds, refreshed while the flow is active. */
  updatedAt: number;
}

export type VoiceRejection =
  | "invalid_arguments"
  | "unknown_idea"
  | "wrong_phase"
  | "camera_not_ready"
  | "paused"
  | "capture_in_progress"
  | "already_captured"
  | "capture_failed"
  | "no_instruction"
  | "busy"
  | "stale"
  | "unavailable";

export type VoiceActionResult<Outcome extends string> =
  | { ok: true; outcome: Outcome }
  | { ok: false; reason: VoiceRejection };

export interface VoiceActions {
  selectIdea(ideaId: string, signal: AbortSignal):
    | VoiceActionResult<"idea_selected">
    | Promise<VoiceActionResult<"idea_selected">>;
  setCoachingPaused(paused: boolean, signal: AbortSignal):
    | VoiceActionResult<"paused" | "resumed">
    | Promise<VoiceActionResult<"paused" | "resumed">>;
  requestCapture(signal: AbortSignal):
    | VoiceActionResult<"captured">
    | Promise<VoiceActionResult<"captured">>;
}

export type VoiceUnavailableReason =
  | "not_configured"
  | "microphone_unavailable"
  | "permission_denied"
  | "rate_limited"
  | "provider_unavailable"
  | "connection_lost";

export interface VoiceDirectorState {
  status: "disconnected" | "connecting" | "listening" | "speaking" | "error";
  /** null until checked. This reports configuration separately from live connectivity. */
  configured: boolean | null;
  micMuted: boolean;
  reason: VoiceUnavailableReason | null;
  /** The last final line only, held in memory until it is replaced or the session ends. */
  transcript: { speaker: "user" | "agent"; text: string } | null;
}

export interface VoiceLine {
  instruction: CoachInstruction;
  ideaId: string;
  lang: Lang;
  kind: "correction" | "countdown" | "capture";
}

export interface VoiceDirector {
  /** Start only from a gesture after explaining microphone transmission. */
  start(lang: Lang): Promise<void>;
  end(): Promise<void>;
  setMicMuted(muted: boolean): void;
  updateContext(context: VoiceContext): void;
  deliverCorrection(line: VoiceLine): void;
  cancelSpeech(): void;
  getState(): VoiceDirectorState;
  subscribe(listener: () => void): () => void;
}
