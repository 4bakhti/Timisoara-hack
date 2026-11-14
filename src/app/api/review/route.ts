import { ReviewRequest, ReviewResponse } from "@/lib/contracts";
import { sampleReview } from "@/lib/fixtures";
import { env } from "@/server/env";
import { generateJson } from "@/server/gemini";
import { clientKey, fail, RateLimiter, readBody } from "@/server/http";
import { reviewSystem, reviewUser } from "@/server/prompts";

export const maxDuration = 30;

const limiter = new RateLimiter(20, 60_000);
const Answer = ReviewResponse.omit({ mock: true });

/** Before and after photos in; what improved and one lesson out. */
export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readBody(request, ReviewRequest);
  if ("response" in body) return body.response;
  const { before, after, idea, scores, lang } = body.data;

  const sample: ReviewResponse = { ...sampleReview(lang), mock: true };
  const key = env.geminiKey();
  if (!key) return Response.json(sample);

  const review = await generateJson(key, {
    model: env.geminiModel(),
    fallbackModel: env.geminiFallbackModel(),
    system: reviewSystem(lang),
    text: reviewUser(idea, scores),
    images: [before, after],
    schema: Answer,
    timeoutMs: 14_000,
    temperature: 0.5,
  });
  return Response.json(review ?? sample);
}
