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
}

export async function generateJson<T>(apiKey: string, call: JsonCall<T>): Promise<T | null> {
  const images = call.images.map(splitDataUrl);
  if (images.some((image) => image === null)) return null;
  const imageParts = images.map((image) => ({ inlineData: image! }));
  const schema = jsonSchemaFor(call.schema);
  const deadline = Date.now() + call.timeoutMs;
  let correction = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 800) break;
    // The second attempt describes the schema in words instead of passing it, in case the
    // API rejected the schema itself.
    const strict = attempt === 0;
    const text = strict
      ? call.text + correction
      : `${call.text}${correction}\n\nAnswer with JSON only, matching this JSON Schema exactly:\n${JSON.stringify(schema)}`;
    try {
      const response = await getClient(apiKey).models.generateContent({
        model: call.model,
        contents: [{ role: "user", parts: [...imageParts, { text }] }],
        config: {
          systemInstruction: call.system,
          responseMimeType: "application/json",
          ...(strict ? { responseJsonSchema: schema } : {}),
          temperature: call.temperature ?? 0.7,
          abortSignal: AbortSignal.timeout(remaining),
        },
      });
      const parsed = call.schema.safeParse(JSON.parse(response.text ?? ""));
      if (parsed.success) return parsed.data;
      correction = `\n\nYour previous answer was rejected for these reasons:\n${z.prettifyError(parsed.error)}\nAnswer again and fix exactly these.`;
    } catch (err) {
      // Never log the request: it contains the user's photo.
      console.error(`[gemini] ${call.model} attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : "unknown error");
    }
  }
  return null;
}
