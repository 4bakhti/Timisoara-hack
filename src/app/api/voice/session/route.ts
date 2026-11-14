import { clientKey, fail, isSameOriginRequest, RateLimiter } from "@/server/http";
import { createVoiceSession, sessionConfig } from "@/server/voiceSession";

export const runtime = "nodejs";
export const maxDuration = 8;

const perClient = new RateLimiter(4, 60_000);
const global = new RateLimiter(25, 60_000);

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return fail(403, "wrong_origin");
  const config = sessionConfig();
  if (!config) return fail(501, "not_configured");
  if (!perClient.allow(clientKey(request)) || !global.allow("voice-session")) {
    return fail(429, "rate_limited");
  }

  try {
    return Response.json(await createVoiceSession(config), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return fail(502, "voice_session_unavailable");
  }
}
