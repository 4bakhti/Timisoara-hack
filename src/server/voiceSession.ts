import { VoiceSessionAccess } from "@/lib/contracts";
import { ELEVENLABS_ORIGIN } from "./elevenlabs";
import { env } from "./env";

export function sessionConfig() {
  const key = env.elevenLabsKey();
  const agentId = env.elevenLabsAgent();
  return key && agentId ? { key, agentId } : null;
}

/** Each successful request mints new, single-use access for the configured agent. */
export async function createVoiceSession(config: NonNullable<ReturnType<typeof sessionConfig>>) {
  const url = new URL("/v1/convai/conversation/get-signed-url", ELEVENLABS_ORIGIN);
  url.searchParams.set("agent_id", config.agentId);
  url.searchParams.set("include_conversation_id", "true");

  const response = await fetch(url, {
    headers: { "xi-api-key": config.key, accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("voice_session_unavailable");
  }
  const access = await response.json() as { signed_url?: unknown };
  return VoiceSessionAccess.parse({ signedUrl: access.signed_url });
}
