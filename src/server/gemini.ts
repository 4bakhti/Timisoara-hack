/**
 * One place that talks to the Gemini API.
 *
 * Every call asks for JSON that matches a zod schema and checks the answer. An
 * invalid answer gets one retry that includes what was wrong. A caller that gets
 * null falls back to sample data, so a failure here never breaks the app.
 */
import { GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";

let client: GoogleGenAI | null = null;
let clientKey: string | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

/** Splits "data:image/jpeg;base64,AAAA" into its type and data. null when it is not an image data URL. */
export function splitDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

/** The schema as JSON Schema, without the "$schema" marker the API does not need. */
export function jsonSchemaFor(schema: ZodType): Record<string, unknown> {
  const { $schema: _unused, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _unused;
  return rest;
}

export interface JsonCall<T> {
  model: string;
  system: string;
  text: string;
  /** Image data URLs, in the order the prompt refers to them. */
  images: string[];
  schema: ZodType<T>;
  timeoutMs: number;
  temperature?: number;
  /** Used for the last attempt, and right away when the main model is overloaded. */
  fallbackModel?: string;
}

/** Overloaded, rate-limited or timed out: worth trying again, possibly on another model. */
export function isTransient(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|aborted|timed? ?out/i.test(message);
}

/**
 * Which model each attempt uses. Attempts 1 and 2 use the main model, the last uses the
 * fallback; after a transient error the fallback is tried straight away.
 */
export function modelForAttempt(attempt: number, lastErrorTransient: boolean, model: string, fallback?: string): string {
  if (!fallback) return model;
  if (attempt === 0) return model;
  if (attempt === 1) return lastErrorTransient ? fallback : model;
  return fallback;
}

const MAX_ATTEMPTS = 3;

export async function generateJson<T>(apiKey: string, call: JsonCall<T>): Promise<T | null> {
  const images = call.images.map(splitDataUrl);
  if (images.some((image) => image === null)) return null;
  const imageParts = images.map((image) => ({ inlineData: image! }));
  const schema = jsonSchemaFor(call.schema);
  const deadline = Date.now() + call.timeoutMs;
  let correction = "";
  let lastErrorTransient = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    const model = modelForAttempt(attempt, lastErrorTransient, call.model, call.fallbackModel);
    try {
      const response = await getClient(apiKey).models.generateContent({
        model,
        contents: [{ role: "user", parts: [...imageParts, { text: call.text + correction }] }],
        config: {
          systemInstruction: call.system,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: call.temperature ?? 0.7,
          abortSignal: AbortSignal.timeout(remaining),
        },
      });
      lastErrorTransient = false;
      const parsed = call.schema.safeParse(JSON.parse(response.text ?? ""));
      if (parsed.success) return parsed.data;
      correction = `\n\nYour previous answer was rejected for these reasons:\n${z.prettifyError(parsed.error)}\nAnswer again and fix exactly these.`;
      console.error(`[gemini] ${model} attempt ${attempt + 1}: answer did not match the schema`);
    } catch (error) {
      lastErrorTransient = isTransient(error);
      // Provider error messages can include request details or unvalidated model output,
      // so only the status and whether the error is worth retrying are logged.
      const status = error instanceof Error && "status" in error && typeof error.status === "number"
        ? ` HTTP ${error.status}`
        : "";
      console.error(`[gemini] ${model} attempt ${attempt + 1} failed.${status}${lastErrorTransient ? " (overloaded or timed out)" : ""}`);
    }
  }
  return null;
}
