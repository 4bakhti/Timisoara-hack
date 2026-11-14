/** Plays one local coach line at a time. Every attempt can be cancelled. */
import { api } from "@/lib/api";
import type { Lang } from "@/lib/contracts";
import { phraseClipUrl, phraseText, type PhraseId } from "./phrases";
import type { CoachInstruction } from "./types";

const SPEECH_LANG: Record<Lang, string> = { en: "en-US", ro: "ro-RO" };
// A silent PCM frame lets the shared audio element start inside the tap.
const SILENCE = "data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA";

let player: HTMLAudioElement | null = null;
let active: AbortController | null = null;
let muted = false;

function audioPlayer() {
  player ??= new Audio();
  player.preload = "auto";
  return player;
}

/** Call from a tap before starting deferred playback. */
export function unlockAudio(): void {
  if (typeof window === "undefined" || active) return;
  const audio = audioPlayer();
  audio.src = SILENCE;
  void audio.play().catch(() => undefined);
}

export function setMuted(value: boolean): void {
  muted = value;
  if (value) stopSpeaking();
}

export function stopSpeaking(): void {
  active?.abort();
}

export function say(id: PhraseId, lang: Lang): Promise<void> {
  const localOnly = id === "hold" || id === "three" || id === "two" || id === "one" || id === "got_it";
  return speakInstruction({ id, text: phraseText(id, lang), to: "anyone" }, lang, { localOnly });
}

export function sayText(text: string, lang: Lang): Promise<void> {
  return speakInstruction({ id: "custom", text, to: "anyone" }, lang);
}

/** Fixed clip, server TTS, then device speech. Countdown never waits for a POST. */
export async function speakInstruction(
  line: CoachInstruction,
  lang: Lang,
  options: { localOnly?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  const text = line.text.trim();
  if (typeof window === "undefined" || muted || !text || options.signal?.aborted) return;

  stopSpeaking();
  const controller = new AbortController();
  const { signal } = controller;
  active = controller;
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });

  try {
    if (line.id !== "custom" && await playClip(phraseClipUrl(line.id, lang), signal, options.localOnly ? 250 : 450)) {
      return;
    }
    if (!options.localOnly && !signal.aborted && text.length <= 300) {
      const tts = new AbortController();
      const stopTts = () => tts.abort();
      signal.addEventListener("abort", stopTts, { once: true });
      const timeout = window.setTimeout(stopTts, 1800);
      let blob: Blob | null;
      try {
        blob = await api.speak({ text, lang }, tts.signal);
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", stopTts);
      }
      if (blob && !signal.aborted) {
        const url = URL.createObjectURL(blob);
        try {
          if (await playClip(url, signal, 450)) return;
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    }
    if (!signal.aborted) await speakWithDevice(text, lang, signal);
  } finally {
    options.signal?.removeEventListener("abort", cancel);
    if (active === controller) active = null;
  }
}

function playClip(url: string, signal: AbortSignal, startTimeout: number): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  const audio = audioPlayer();
  return new Promise((resolve) => {
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      window.clearTimeout(timer);
      audio.pause();
      if (!ok) {
        audio.removeAttribute("src");
        audio.load();
      }
      resolve(ok);
    };
    const abort = () => finish(false);
    let timer = window.setTimeout(abort, startTimeout);
    audio.onplaying = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finish(true), 8000);
    };
    audio.onended = () => finish(true);
    audio.onerror = abort;
    signal.addEventListener("abort", abort, { once: true });
    audio.src = url;
    void audio.play().catch(abort);
  });
}

function speakWithDevice(text: string, lang: Lang, signal: AbortSignal): Promise<void> {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve();
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANG[lang];
  utterance.rate = 1.02;

  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      utterance.onend = null;
      utterance.onerror = null;
      resolve();
    };
    const abort = () => {
      done();
      synth.cancel();
    };
    const timer = window.setTimeout(abort, 6000);
    utterance.onend = done;
    utterance.onerror = done;
    signal.addEventListener("abort", abort, { once: true });
    synth.speak(utterance);
  });
}
