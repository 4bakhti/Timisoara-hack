import { z } from "zod";
import { PoseRequest, type PoseResponse } from "@/lib/contracts";
import { env } from "@/server/env";
import { generateJson } from "@/server/gemini";
import { clientKey, fail, RateLimiter, readBody } from "@/server/http";
import { poseSystem, poseUser } from "@/server/prompts";
import { POSE_TEMPLATE_INFO } from "@/vision/poses/catalog";

export const maxDuration = 20;

const limiter = new RateLimiter(30, 60_000);
const ids = POSE_TEMPLATE_INFO.map((pose) => pose.id) as [string, ...string[]];
const Choice = z.object({ poses: z.array(z.enum(ids)).min(1).max(4) });

/** Camera photo in, the best poses for this person here out (catalog ids, best first). No text at all. */
export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readBody(request, PoseRequest);
  if ("response" in body) return body.response;

  const key = env.geminiKey();
  if (!key) return fail(501, "not_configured");

  const choice = await generateJson(key, {
    model: env.geminiModel(),
    fallbackModel: env.geminiFallbackModel(),
    system: poseSystem(),
    text: poseUser(),
    images: [body.data.image],
    schema: Choice,
    timeoutMs: 9_000,
  });
  if (!choice) return fail(502, "pose_unavailable");

  const answer: PoseResponse = { poses: [...new Set(choice.poses)] };
  return Response.json(answer);
}
