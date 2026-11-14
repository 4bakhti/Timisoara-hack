// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeList } from "@/components/RecipeList";
import { HEALTH_NO_DB, HEALTH_WITH_DB, TEST_RECIPE } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, health: vi.fn(), recipes: { list: vi.fn(), listResult: vi.fn(), get: vi.fn(), load: vi.fn(), create: vi.fn(), use: vi.fn() } },
  };
});

const listResult = vi.mocked(api.recipes.listResult);

beforeEach(() => {
  listResult.mockReset();
  vi.mocked(api.health).mockResolvedValue(HEALTH_WITH_DB);
});
afterEach(cleanup);

describe("RecipeList", () => {
  it("tells an unavailable service apart from an empty list, and can retry", async () => {
    listResult.mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce({ status: "ok", recipes: [] });
    render(<RecipeList />);
    expect(await screen.findByText(t("recipesUnavailable", "en"))).toBeTruthy();
    expect(screen.queryByText(t("recipesNone", "en"))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t("retry", "en") }));
    expect(await screen.findByText(t("recipesNone", "en"))).toBeTruthy();
    expect(screen.queryByText(t("recipesUnavailable", "en"))).toBeNull();
  });

  it("lists public recipes only, labels sample ones, and flags temporary storage", async () => {
    vi.mocked(api.health).mockResolvedValue({ ...HEALTH_NO_DB, storage: "memory" });
    listResult.mockResolvedValue({
      status: "ok",
      recipes: [
        { ...TEST_RECIPE, id: "a", title: "Public real" },
        { ...TEST_RECIPE, id: "b", title: "Public sample", sample: true },
        { ...TEST_RECIPE, id: "c", title: "Hidden one", status: "hidden" },
      ],
    });
    render(<RecipeList />);
    expect(await screen.findByText("Public real")).toBeTruthy();
    expect(screen.getByText("Public sample")).toBeTruthy();
    expect(screen.queryByText("Hidden one")).toBeNull();
    expect(screen.getAllByText(t("madeFromSample", "en"))).toHaveLength(1);
    expect(screen.getByText(t("tempStorageRecipe", "en"))).toBeTruthy();
    expect(api.recipes.list).not.toHaveBeenCalled();
  });
});
