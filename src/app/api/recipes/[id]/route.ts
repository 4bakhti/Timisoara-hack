import { fail } from "@/server/http";
import { getStore } from "@/server/store";
import { NO_STORE, storageResponse } from "@/server/store/http";
import { recipeId } from "@/server/store/recipes";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/recipes/[id]">) {
  const { id } = await context.params;
  if (!recipeId.safeParse(id).success) return fail(404, "not_found");
  return storageResponse(async () => {
    const recipe = await getStore().getRecipe(id);
    return recipe ? Response.json(recipe, { headers: NO_STORE }) : fail(404, "not_found");
  });
}
