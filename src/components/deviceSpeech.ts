import type { CoachSpeech } from "@/coach";
import type { Lang } from "@/lib/contracts";

const SPEECH_LANG: Record<Lang, string> = { en: "en-US", ro: "ro-RO" };

/**
 * Speaks coach lines with the phone's own voice only, never the server voice.
 * The demo uses it so a demo run makes no network requests at all.
 */
export const deviceSpeech: CoachSpeech = {
  say({ instruction, lang }) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(instruction.text);
    utterance.lang = SPEECH_LANG[lang];
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  },
  cancel() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  },
};
