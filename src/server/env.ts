/**
 * Server configuration. Every value is optional: without a key, the matching
 * feature answers with sample data or reports "not configured".
 * Read through these functions, never from process.env directly.
 */
import type { Health } from "@/lib/contracts";
import { previewsPaused } from "./preview";

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
  /**
   * AI pose previews ("Nano Banana"). Nano Banana 2 Lite is the fastest and cheapest image
   * model; set GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1 for higher quality. Image generation
   * needs an account with image quota (billing); free keys answer 429.
   */
  geminiImageModel: () => read("GEMINI_IMAGE_MODEL") ?? "gemini-3.1-flash-lite-image",
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
    preview: env.geminiKey() !== null && !previewsPaused(),
    stamp: false,
  };
}
