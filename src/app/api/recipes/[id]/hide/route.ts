import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { clientKey, fail, RateLimiter } from "@/server/http";
import { getStore } from "@/server/store";
import { NO_STORE, storageResponse } from "@/server/store/http";
import { recipeId } from "@/server/store/recipes";

const limiter = new RateLimiter(10, 60_000);
const digest = (value: string) => createHash("sha256").update(value).digest();

export async function POST(request: Request, context: RouteContext<"/api/recipes/[id]/hide">) {
  const token = env.recipesAdminToken();
  if (!token) return fail(501, "not_configured");
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!timingSafeEqual(digest(supplied), digest(token))) return fail(403, "forbidden");
  const { id } = await context.params;
  if (!recipeId.safeParse(id).success) return fail(404, "not_found");
  return storageResponse(async () => await getStore().hideRecipe(id)
    ? Response.json({ ok: true }, { headers: NO_STORE }) : fail(404, "not_found"));
}
