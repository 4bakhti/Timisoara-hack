import { EventsRequest } from "@/lib/contracts";
import { clientKey, fail, RateLimiter } from "@/server/http";
import { getStore } from "@/server/store";
import { readStorageBody, sessionMetadata, storageResponse } from "@/server/store/http";

const RequestBody = EventsRequest.extend({
  ...sessionMetadata,
  events: EventsRequest.shape.events.refine((events) => events.every((event) =>
    event.t >= 0 && (event.fps === undefined || event.fps >= 0) &&
    (event.instruction == null || /^[a-z0-9_]{1,64}$/.test(event.instruction)),
  )),
});
const limiter = new RateLimiter(30, 60_000);

export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readStorageBody(request, RequestBody, 64 * 1024);
  if ("response" in body) return body.response;
  return storageResponse(async () => {
    await getStore().recordEvents(body.data);
    return Response.json({ ok: true });
  });
}
