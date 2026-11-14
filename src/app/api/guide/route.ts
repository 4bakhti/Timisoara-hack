import { GuideRequest, GuideResponse } from "@/lib/contracts";
import { env } from "@/server/env";
import { generateJson } from "@/server/gemini";
import { clientKey, fail, RateLimiter, readBody } from "@/server/http";
import { guideSystem, guideUser } from "@/server/prompts";

export const maxDuration = 15;

// The coach asks every 2.5 seconds while framing a scene without people.
const limiter = new RateLimiter(40, 60_000);
const Answer = GuideResponse.omit({ mock: true });
const NO_ADVICE: GuideResponse = { match: 50, fix: null, mock: true };

/** A small camera frame and the chosen idea in; how well it matches and one correction out. */
export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readBody(request, GuideRequest);
  if ("response" in body) return body.response;
  const { frame, idea, lang } = body.data;

  const key = env.geminiKey();
  if (!key) return Response.json(NO_ADVICE);

  const answer = await generateJson(key, {
    model: env.geminiFastModel(),
    system: guideSystem(lang),
    text: guideUser(idea),
    images: [frame],
    schema: Answer,
    timeoutMs: 5_000,
    temperature: 0.2,
  });
  return Response.json(answer ?? NO_ADVICE);
}
