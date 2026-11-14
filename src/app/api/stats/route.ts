import { fail } from "@/server/http";
import { getStore } from "@/server/store";
import { NO_STORE, roundLabel, storageResponse } from "@/server/store/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("round");
  const parsed = roundLabel.optional().safeParse(raw ?? undefined);
  if (!parsed.success) return fail(400, "bad_request");
  return storageResponse(async () => Response.json(await getStore().stats(parsed.data), { headers: NO_STORE }));
}
