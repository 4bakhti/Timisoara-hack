/** Shared plumbing for API routes: reading a validated JSON body, errors, rate limiting. */
import type { ZodType } from "zod";
import type { ApiError } from "@/lib/contracts";

export function fail(status: number, error: string, message?: string): Response {
  const body: ApiError = message ? { error, message } : { error };
  return Response.json(body, { status });
}

const MAX_BODY_BYTES = 3_000_000;

/** Parses and validates a JSON body. Returns the data, or the error response to send. */
export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<{ data: T } | { response: Response }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { response: fail(413, "too_large") };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { response: fail(400, "bad_request") };
  }
  if (text.length > MAX_BODY_BYTES) return { response: fail(413, "too_large") };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { response: fail(400, "bad_request", "The body is not valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { response: fail(400, "bad_request", "The body does not match the expected shape.") };
  return { data: parsed.data };
}

/** A small in-memory limiter: `limit` requests per `windowMs` for each key. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** true when the request may proceed. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear(); // Never grow without bound.
    return true;
  }
}

export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
