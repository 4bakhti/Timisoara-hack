/**
 * The coach's voice.
 *
 * Fixed lines play from pre-generated clips (public/voice/<lang>/<id>.mp3) so there
 * is no delay. If a clip is missing, the phone's own speech synthesis is used, so
 * the coach still talks before the clips exist and when the network is down.
 *
 * Phones only allow sound after a tap: call unlockAudio() inside a click handler
 * before the first line.
 */
import type { Lang } from "@/lib/contracts";
import { phraseClipUrl, phraseText, type PhraseId } from "./phrases";

const SPEECH_LANG: Record<Lang, string> = { en: "en-US", ro: "ro-RO" };

let player: HTMLAudioElement | null = null;
const missingClips = new Set<string>();
let muted = false;

/** Call from a user gesture (tap). Safe to call more than once. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (!player) {
    player = new Audio();
    player.preload = "auto";
  }
  // Playing (and immediately pausing) inside the gesture unlocks later playback on iOS.
  player.muted = true;
  const attempt = player.play();
  if (attempt) attempt.then(() => player?.pause()).catch(() => undefined);
  player.muted = false;
  if ("speechSynthesis" in window) {
    const warm = new SpeechSynthesisUtterance(" ");
    warm.volume = 0;
    window.speechSynthesis.speak(warm);
  }
}

export function setMuted(value: boolean): void {
  muted = value;
  if (value) stopSpeaking();
}

export function stopSpeaking(): void {
  if (typeof window === "undefined") return;
  player?.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Says one of the fixed coach lines. Resolves when it has finished (or failed quietly). */
export async function say(id: PhraseId, lang: Lang): Promise<void> {
  if (muted || typeof window === "undefined") return;
  const url = phraseClipUrl(id, lang);
  if (!missingClips.has(url)) {
    const played = await playClip(url);
    if (played) return;
    missingClips.add(url);
  }
  await speakWithDevice(phraseText(id, lang), lang);
}

/** Says free text (for example a summary). Uses the server voice when available. */
export async function sayText(text: string, lang: Lang): Promise<void> {
  if (muted || typeof window === "undefined" || !text.trim()) return;
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (res.ok && res.headers.get("content-type")?.startsWith("audio/")) {
      const objectUrl = URL.createObjectURL(await res.blob());
      const played = await playClip(objectUrl);
      URL.revokeObjectURL(objectUrl);
      if (played) return;
    }
  } catch {
    // Fall through to the device voice.
  }
  await speakWithDevice(text, lang);
}

function playClip(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!player) player = new Audio();
    const audio = player;
    const done = (ok: boolean) => {
      audio.onended = null;
      audio.onerror = null;
      resolve(ok);
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    audio.src = url;
    audio.play().catch(() => done(false));
  });
}

function speakWithDevice(text: string, lang: Lang): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = SPEECH_LANG[lang];
    utterance.rate = 1.02;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    // Some browsers never fire onend; do not hang the coach on it.
    window.setTimeout(resolve, 6000);
  });
}
