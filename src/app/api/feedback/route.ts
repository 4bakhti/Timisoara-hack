import { z } from "zod";
import { FeedbackRequest } from "@/lib/contracts";
import { clientKey, fail, RateLimiter } from "@/server/http";
import { getStore } from "@/server/store";
import { cleanText, NO_STORE, readStorageBody, sessionMetadata, storageResponse } from "@/server/store/http";

const RequestBody = FeedbackRequest.extend({
  ...sessionMetadata,
  comment: z.string().max(500).transform(cleanText).optional(),
});
const limiter = new RateLimiter(10, 60_000);

export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readStorageBody(request, RequestBody, 8 * 1024);
  if ("response" in body) return body.response;
  return storageResponse(async () => {
    const store = getStore();
    await store.saveFeedback(body.data);
    return Response.json({ ok: true, storage: store.mode }, { headers: NO_STORE });
  });
}
