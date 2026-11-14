import { phraseText, PHRASE_IDS } from "@/coach/phrases";
import type { SpeakRequest } from "@/lib/contracts";
import { env } from "./env";

export const ELEVENLABS_ORIGIN = "https://api.elevenlabs.io";
export const SPEECH_MODEL = "eleven_flash_v2_5";
const MAX_AUDIO_BYTES = 512 * 1024;
const CACHE_LIMIT = 64;
const CACHE_TTL_MS = 30 * 60_000;
const MAX_IN_FLIGHT = 8;

const fixedText = {
  en: new Set(PHRASE_IDS.map((id) => phraseText(id, "en"))),
  ro: new Set(PHRASE_IDS.map((id) => phraseText(id, "ro"))),
};
type AudioBytes = Uint8Array<ArrayBuffer>;
type VoiceConfig = { key: string; voiceId: string };
type CacheEntry = { audio: AudioBytes; expires: number };

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<AudioBytes>>();
let activeRequests = 0;

export function speechConfig(lang: SpeakRequest["lang"]): VoiceConfig | null {
  const key = env.elevenLabsKey();
  const voiceId = (lang === "ro" && env.elevenLabsRomanianVoice()) || env.elevenLabsVoice();
  return key && voiceId ? { key, voiceId } : null;
}

async function readAudio(response: Response): Promise<AudioBytes> {
  if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/mpeg") || !response.body) {
    await response.body?.cancel();
    throw new Error("speech_unavailable");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new Error("audio_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("empty_audio");
  const audio = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio;
}

/** Used by the route and the clip generator. Only fixed coach phrases can enter the cache. */
export async function synthesizeSpeech(config: VoiceConfig, request: SpeakRequest): Promise<AudioBytes> {
  const cacheKey = fixedText[request.lang].has(request.text)
    ? JSON.stringify([SPEECH_MODEL, config.voiceId, request.lang, request.text])
    : null;
  if (cacheKey) {
    const existing = cache.get(cacheKey);
    if (existing && existing.expires > Date.now()) {
      cache.delete(cacheKey);
      cache.set(cacheKey, existing);
      return existing.audio;
    }
    cache.delete(cacheKey);
    const inFlight = pending.get(cacheKey);
    if (inFlight) return inFlight;
  }
  if (activeRequests >= MAX_IN_FLIGHT) throw new Error("speech_busy");

  const url = new URL("/v1/text-to-speech/" + encodeURIComponent(config.voiceId), ELEVENLABS_ORIGIN);
  url.searchParams.set("output_format", "mp3_22050_32");
  activeRequests++;
  const fetchSpeech = async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": config.key,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({ text: request.text, model_id: SPEECH_MODEL, language_code: request.lang }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(7000),
      });
      const audio = await readAudio(response);
      if (cacheKey) {
        cache.set(cacheKey, { audio, expires: Date.now() + CACHE_TTL_MS });
        if (cache.size > CACHE_LIMIT) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
      }
      return audio;
    } finally {
      activeRequests--;
      if (cacheKey) pending.delete(cacheKey);
    }
  };
  const result = fetchSpeech();
  if (cacheKey) pending.set(cacheKey, result);
  return result;
}
