import { AnalyzeRequest, ShotPlan, type AnalyzeResponse } from "@/lib/contracts";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { env } from "@/server/env";
import { generateJson } from "@/server/gemini";
import { clientKey, fail, RateLimiter, readBody } from "@/server/http";
import { tidyPlan } from "@/server/plan";
import { analyzeSystem, analyzeUser } from "@/server/prompts";

export const maxDuration = 30;

const limiter = new RateLimiter(20, 60_000);

/** Photo in, three shot ideas out. Answers with sample data when no AI key is set. */
export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readBody(request, AnalyzeRequest);
  if ("response" in body) return body.response;
  const { image, lang, mode } = body.data;

  const sample: AnalyzeResponse = { plan: SAMPLE_PLAN_PERSON, mock: true };
  const key = env.geminiKey();
  if (!key) return Response.json(sample);

  const started = Date.now();
  const model = env.geminiModel();
  const plan = await generateJson(key, {
    model,
    fallbackModel: env.geminiFallbackModel(),
    system: analyzeSystem(lang),
    text: analyzeUser(mode),
    images: [image],
    schema: ShotPlan,
    timeoutMs: 14_000,
  });
  if (!plan) return Response.json(sample);

  const answer: AnalyzeResponse = { plan: tidyPlan(plan), model, ms: Date.now() - started };
  return Response.json(answer);
}
