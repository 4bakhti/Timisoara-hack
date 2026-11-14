/** Public surface of the coach module. Import from "@/coach", not from deep paths. */
export { useCoachSession } from "./useCoachSession";
export { unlockAudio, say, sayText, setMuted, stopSpeaking } from "./voice";
export { PHRASES, PHRASE_IDS, phraseText, phraseAudience, phraseClipUrl, type PhraseId, type Audience } from "./phrases";
export type {
  CapturedShot,
  CoachCaptureResult,
  CoachInstruction,
  CoachPhase,
  CoachSession,
  CoachSessionOptions,
  CoachState,
  CoachSpeech,
  CoachSpeechLine,
} from "./types";
