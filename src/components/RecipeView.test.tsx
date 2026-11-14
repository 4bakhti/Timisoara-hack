// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeView } from "@/components/RecipeView";
import { deferred, HEALTH_NO_DB, HEALTH_WITH_DB, TEST_RECIPE } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import type { Recipe } from "@/lib/contracts";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, health: vi.fn(), recipes: { list: vi.fn(), get: vi.fn(), create: vi.fn(), load: vi.fn(), listResult: vi.fn(), use: vi.fn(async () => true) } } };
});

// The camera coach itself is covered in ShootFlow.test.tsx; here it only needs to receive the recipe.
vi.mock("@/components/ShootFlow", () => ({
  ShootFlow: ({ recipe, onExit }: { recipe?: Recipe; onExit?: () => void }) => (
    <div data-testid="shoot-flow" data-idea={recipe?.idea.id}>
      <button type="button" onClick={onExit}>
        exit
      </button>
    </div>
  ),
}));

/** What the server answers in each test; null stands for "unavailable". */
const get = vi.fn<(id: string) => Promise<Recipe | null>>();
const load = vi.mocked(api.recipes.load);
const health = vi.mocked(api.health);

beforeEach(() => {
  get.mockReset();
  load.mockReset();
  load.mockImplementation(async (id) => {
    const answer = await get(id);
    return answer ? { status: "ok", recipe: answer } : { status: "unavailable" };
  });
  health.mockReset();
  health.mockResolvedValue(HEALTH_WITH_DB);
});
afterEach(cleanup);

describe("RecipeView", () => {
  it("shows a loading state, then the recipe that was asked for", async () => {
    const pending = deferred<Recipe | null>();
    get.mockReturnValue(pending.promise);
    render(<RecipeView id="abc123" />);
    expect(screen.getByText(t("recipeLoading", "en"))).toBeTruthy();
    expect(get).toHaveBeenCalledWith("abc123");

    pending.resolve(TEST_RECIPE);
    expect(await screen.findByRole("heading", { level: 1, name: TEST_RECIPE.title })).toBeTruthy();
    expect(screen.getByText(TEST_RECIPE.idea.photographer.say)).toBeTruthy();
    expect(screen.getByText(/Test square/)).toBeTruthy();
    expect(screen.queryByText(t("recipeLoading", "en"))).toBeNull();
    // The link shown is the recipe's own address.
    expect((screen.getByTestId("share-url") as HTMLInputElement).value).toBe(`${window.location.origin}/r/abc123`);
  });

  it("hands the recipe's idea to the coach only when asked, and comes back", async () => {
    get.mockResolvedValue(TEST_RECIPE);
    render(<RecipeView id="abc123" />);
    const recreate = await screen.findByRole("button", { name: t("recreate", "en") });
    expect(screen.queryByTestId("shoot-flow")).toBeNull();

    fireEvent.click(recreate);
    expect(screen.getByTestId("shoot-flow").getAttribute("data-idea")).toBe(TEST_RECIPE.idea.id);
    expect(screen.queryByRole("button", { name: t("recreate", "en") })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "exit" }));
    expect(screen.queryByTestId("shoot-flow")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: TEST_RECIPE.title })).toBeTruthy();
  });

  it("says the service is unavailable, without claiming the recipe is gone, and can try again", async () => {
    get.mockResolvedValueOnce(null).mockResolvedValueOnce(TEST_RECIPE);
    render(<RecipeView id="gone" />);
    expect(await screen.findByText(t("recipeMissing", "en"))).toBeTruthy();
    expect(screen.getByText(t("recipeUnavailableWhy", "en"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("recreate", "en") })).toBeNull();
    expect(screen.queryByTestId("share-url")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t("retry", "en") }));
    expect(await screen.findByRole("heading", { level: 1, name: TEST_RECIPE.title })).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not offer a share link for a recipe that is not public", async () => {
    get.mockResolvedValue({ ...TEST_RECIPE, status: "hidden" });
    render(<RecipeView id="abc123" />);
    expect(await screen.findByText(/not public/)).toBeTruthy();
    expect(screen.queryByTestId("share-url")).toBeNull();
  });

  it("warns about temporary demo storage and shows an optional position as text", async () => {
    get.mockResolvedValue({ ...TEST_RECIPE, lat: 45.7575, lng: 21.2299 });
    health.mockResolvedValue(HEALTH_NO_DB);
    render(<RecipeView id="abc123" />);
    expect(await screen.findByText(t("tempStorageRecipe", "en"))).toBeTruthy();
    expect(screen.getByText(/45\.7575, 21\.2299/)).toBeTruthy();
  });

  it("says plainly when there is no recipe at the link, and offers no retry", async () => {
    load.mockReset();
    load.mockResolvedValue({ status: "not_found" });
    render(<RecipeView id="gone" />);
    expect(await screen.findByText(t("recipeNotFound", "en"))).toBeTruthy();
    expect(screen.queryByText(t("recipeUnavailableWhy", "en"))).toBeNull();
    expect(screen.queryByRole("button", { name: t("retry", "en") })).toBeNull();
    expect(screen.getAllByRole("link", { name: t("allRecipes", "en") }).length).toBeGreaterThan(0);
  });

  it("labels a recipe made from sample suggestions, and never counts a use on page load", async () => {
    get.mockResolvedValue({ ...TEST_RECIPE, sample: true });
    render(<RecipeView id="abc123" />);
    expect(await screen.findByText(t("madeFromSample", "en"))).toBeTruthy();
    expect(api.recipes.use).not.toHaveBeenCalled();
  });
});
