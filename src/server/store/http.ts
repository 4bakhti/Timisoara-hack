import { z, type ZodType } from "zod";
import { fail, readBody } from "@/server/http";

export const NO_STORE = { "Cache-Control": "no-store" };
export const cleanText = (text: string) => text.replace(/\p{Cc}/gu, "").trim();

export const roundLabel = z.string().max(128).transform(cleanText).pipe(z.string().min(1));
export const sessionMetadata = {
  sessionId: z.string().min(1).max(128).regex(/^[^\p{Cc}]+$/u),
  appVersion: z.string().max(80).transform(cleanText).pipe(z.string().min(1)),
  round: roundLabel.optional(),
};

export async function readStorageBody<T>(request: Request, schema: ZodType<T>, limit: number) {
  const result = await readBody(request, schema, limit);
  if ("response" in result && result.response.status === 413) {
    return { response: fail(400, "bad_request", "The request body is too large.") };
  }
  return result;
}

export async function storageResponse(action: () => Promise<Response>) {
  try {
    return await action();
  } catch {
    return Response.json({ error: "storage_unavailable" }, { status: 503, headers: NO_STORE });
  }
}
