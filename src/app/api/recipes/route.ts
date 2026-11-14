import { Recipe } from "@/lib/contracts";
import { clientKey, fail, RateLimiter } from "@/server/http";
import { getStore } from "@/server/store";
import { NO_STORE, readStorageBody, storageResponse } from "@/server/store/http";
import { nearQuery, newRecipeId, RecipeBody } from "@/server/store/recipes";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(5, 60_000);

export async function POST(request: Request) {
  if (!limiter.allow(clientKey(request))) return fail(429, "rate_limited");
  const body = await readStorageBody(request, RecipeBody, 64 * 1024);
  if ("response" in body) return body.response;
  return storageResponse(async () => {
    const store = getStore();
    for (let attempt = 0; attempt < 3; attempt++) {
      const recipe: Recipe = {
        ...body.data, id: newRecipeId(), status: "public", uses: 0, createdAt: new Date().toISOString(),
      };
      if (await store.insertRecipe(recipe)) return Response.json(recipe, { status: 201, headers: NO_STORE });
    }
    return fail(503, "storage_unavailable");
  });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const lat = query.get("lat"), lng = query.get("lng");
  let near: { lat: number; lng: number } | undefined;
  if (lat !== null || lng !== null) {
    if (lat === null || lng === null || !lat.trim() || !lng.trim()) return fail(400, "bad_request");
    const parsed = nearQuery.safeParse({ lat, lng });
    if (!parsed.success) return fail(400, "bad_request");
    near = parsed.data;
  }
  return storageResponse(async () => Response.json(await getStore().listRecipes(near), { headers: NO_STORE }));
}
