/**
 * Server configuration. Every value is optional: without a key, the matching
 * feature answers with sample data or reports "not configured".
 * Read through these functions, never from process.env directly.
 */
import type { Health } from "@/lib/contracts";

const read = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

export const env = {
  geminiKey: () => read("GEMINI_API_KEY"),
  /**
   * Planning and review. Measured on 14 Nov 2026 with a 960 px photo: gemini-3.5-flash-lite
   * answered in 3–4 s with valid, scene-specific plans; gemini-3.6-flash took 16 s,
   * gemini-4-hydrogen 19 s (low thinking) and gemini-3.8-flash over 40 s, too slow for a live demo.
   */
  geminiModel: () => read("GEMINI_MODEL") ?? "gemini-3.5-flash-lite",
  /** Quick framing checks. */
  geminiFastModel: () => read("GEMINI_FAST_MODEL") ?? "gemini-3.5-flash-lite",
  /** Tried when the main model is overloaded (it returned 503 "high demand" once during testing). */
  geminiFallbackModel: () => read("GEMINI_FALLBACK_MODEL") ?? "gemini-3.1-flash-lite",
  elevenLabsKey: () => read("ELEVENLABS_API_KEY"),
  elevenLabsVoice: () => read("ELEVENLABS_VOICE_ID"),
  elevenLabsRomanianVoice: () => read("ELEVENLABS_VOICE_ID_RO"),
  elevenLabsAgent: () => read("ELEVENLABS_AGENT_ID"),
  databaseUrl: () => read("DATABASE_URL"),
  recipesAdminToken: () => read("RECIPES_ADMIN_TOKEN"),
  auth0Ready: () => Boolean(read("AUTH0_DOMAIN") && read("AUTH0_CLIENT_ID") && read("AUTH0_CLIENT_SECRET") && read("AUTH0_SECRET")),
};

export function health(): Health {
  return {
    gemini: env.geminiKey() !== null,
    voice: Boolean(env.elevenLabsKey() && env.elevenLabsVoice()),
    voiceConversation: Boolean(env.elevenLabsKey() && env.elevenLabsAgent()),
    db: env.databaseUrl() !== null,
    storage: env.databaseUrl() !== null ? "database" : "memory",
    auth: env.auth0Ready(),
    preview: false,
    stamp: false,
  };
}
