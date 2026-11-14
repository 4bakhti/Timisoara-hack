import { clientKey, fail, RateLimiter } from "@/server/http";
import { getStore } from "@/server/store";
import { NO_STORE, storageResponse } from "@/server/store/http";
import { recipeId } from "@/server/store/recipes";

const limiter = new RateLimiter(1, 10 * 60_000);

export async function POST(request: Request, context: RouteContext<"/api/recipes/[id]/use">) {
  const { id } = await context.params;
  if (!recipeId.safeParse(id).success) return fail(404, "not_found");
  return storageResponse(async () => {
    const store = getStore();
    if (!await store.getRecipe(id)) return fail(404, "not_found");
    if (!limiter.allow(JSON.stringify([clientKey(request), id]))) return fail(429, "rate_limited");
    return await store.useRecipe(id)
      ? Response.json({ ok: true }, { headers: NO_STORE }) : fail(404, "not_found");
  });
}
