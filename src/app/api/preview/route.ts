import { PreviewRequest, type PreviewResponse } from "@/lib/contracts";
import { getPoseTemplate } from "@/vision/poses/catalog";
import { env } from "@/server/env";
import { generateImage } from "@/server/gemini";
import { clientKey, fail, RateLimiter, readBody } from "@/server/http";
import { imageSizeFromDataUrl, nearestAspectRatio, pausePreviews, previewsPaused } from "@/server/preview";
import { previewPrompt } from "@/server/prompts";

/** Image generation can take a while; allow it. */
export const maxDuration = 60;

// Three previews per scene: about three scenes a minute per address.
const limiter = new RateLimiter(9, 60_000);
/** After the account reports no image quota, stop trying for this long. */
const QUOTA_PAUSE_MS = 10 * 60_000;

/** The scene photo and one idea in; an AI preview of that idea in the same scene out. */
export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readBody(request, PreviewRequest);
  if ("response" in body) return body.response;
  const { image, idea } = body.data;

  if (!idea.subject) return fail(400, "no_subject", "Previews are only made for ideas with a person.");
  const key = env.geminiKey();
  if (!key) return fail(501, "not_configured");
  if (previewsPaused()) return fail(503, "preview_unavailable", "Image generation is not available on this server's plan right now.");

  const size = imageSizeFromDataUrl(image);
  const result = await generateImage(key, {
    model: env.geminiImageModel(),
    text: previewPrompt(idea, getPoseTemplate(idea.subject.poseTemplateId)),
    image,
    aspectRatio: size ? nearestAspectRatio(size.width, size.height) : undefined,
    timeoutMs: 45_000,
  });

  if (result.ok) {
    const answer: PreviewResponse = { image: result.dataUrl };
    return Response.json(answer);
  }
  switch (result.reason) {
    case "quota":
      pausePreviews(QUOTA_PAUSE_MS);
      return fail(503, "preview_quota", "The image model's quota is used up for this account.");
    case "timeout":
      return fail(504, "timeout");
    case "no_image":
      return fail(422, "no_image", "The model did not return a picture for this idea.");
    case "invalid_image":
      return fail(400, "bad_request", "The photo could not be read.");
    default:
      return fail(502, "preview_failed");
  }
}
