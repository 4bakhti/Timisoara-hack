import { SpeakRequest } from "@/lib/contracts";
import { speechConfig, synthesizeSpeech } from "@/server/elevenlabs";
import { clientKey, fail, isSameOriginRequest, RateLimiter, readBody } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 10;

const perClient = new RateLimiter(30, 60_000);
const global = new RateLimiter(100, 60_000);

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return fail(403, "wrong_origin");
  const body = await readBody(request, SpeakRequest, 2048);
  if ("response" in body) return body.response;
  const config = speechConfig(body.data.lang);
  if (!config) return fail(501, "not_configured");
  if (!perClient.allow(clientKey(request)) || !global.allow("speech")) return fail(429, "rate_limited");

  try {
    const audio = await synthesizeSpeech(config, body.data);
    return new Response(audio, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch {
    return fail(502, "speech_unavailable");
  }
}
