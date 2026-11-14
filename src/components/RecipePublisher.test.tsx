// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishError, RecipePublisher } from "@/components/RecipePublisher";
import { deferred, HEALTH_NO_DB, HEALTH_WITH_DB, TEST_IDEA, TEST_RECIPE } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api, ApiFailure } from "@/lib/api";
import type { Recipe } from "@/lib/contracts";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, health: vi.fn(), recipes: { list: vi.fn(), get: vi.fn(), create: vi.fn(), load: vi.fn(), listResult: vi.fn(), use: vi.fn(async () => true) } } };
});

const create = vi.mocked(api.recipes.create);
const health = vi.mocked(api.health);

const NOT_PUBLISHED = t("notPublished", "en");
const open = () => fireEvent.click(screen.getByRole("button", { name: t("makeRecipe", "en") }));
const publishButton = () => screen.getByRole("button", { name: t("publish", "en") });
const shareUrl = () => screen.queryByTestId("share-url") as HTMLInputElement | null;
const qr = () => screen.queryByRole("img", { name: t("qrAlt", "en") });

function stubGeolocation(outcome: { lat: number; lng: number } | "denied") {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
    if (outcome === "denied") fail({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "" } as GeolocationPositionError);
    else ok({ coords: { latitude: outcome.lat, longitude: outcome.lng } } as GeolocationPosition);
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

beforeEach(() => {
  create.mockReset();
  health.mockReset();
  health.mockResolvedValue(HEALTH_WITH_DB);
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("RecipePublisher", () => {
  it("shows a preview and sends nothing until Publish is pressed", () => {
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    expect(create).not.toHaveBeenCalled();
    open();
    expect(screen.getByText(t("recipePreview", "en"))).toBeTruthy();
    expect((screen.getByLabelText(t("recipeTitle", "en")) as HTMLInputElement).value).toBe(TEST_IDEA.title);
    expect(screen.getByText(TEST_IDEA.photographer.say)).toBeTruthy();
    expect(screen.getByText(t("publishNotice", "en"))).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    expect(shareUrl()).toBeNull();
  });

  it("publishes the title, idea and place, never a photo, then shows a link and QR for that recipe", async () => {
    create.mockResolvedValue(TEST_RECIPE);
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    fireEvent.change(screen.getByLabelText(t("recipeTitle", "en")), { target: { value: "  By the window  " } });
    fireEvent.change(screen.getByLabelText(t("recipePlace", "en")), { target: { value: "Test square" } });
    fireEvent.click(publishButton());

    expect(await screen.findByText(t("published", "en"))).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(1);
    const sent = create.mock.calls[0][0];
    expect(sent).toMatchObject({ title: "By the window", idea: TEST_IDEA, place: "Test square" });
    expect(sent).not.toHaveProperty("lat");
    expect(sent).not.toHaveProperty("lng");
    expect(JSON.stringify(sent)).not.toContain("data:image");

    const url = `${window.location.origin}/r/${TEST_RECIPE.id}`;
    expect(shareUrl()?.value).toBe(url);
    expect(qr()?.getAttribute("data-qr-value")).toBe(url);
    expect(screen.getByRole("link", { name: t("openRecipe", "en") }).getAttribute("href")).toBe(`/r/${TEST_RECIPE.id}`);
    expect(screen.queryByText(t("tempStorageRecipe", "en"))).toBeNull();
  });

  it("never shows a link when the save failed, and a retry can succeed", async () => {
    create.mockRejectedValueOnce(new ApiFailure(404, "request_failed")).mockResolvedValueOnce(TEST_RECIPE);
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    fireEvent.click(publishButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(NOT_PUBLISHED);
    expect(alert.textContent).toContain(t("errMissing", "en"));
    expect(screen.queryByText(t("published", "en"))).toBeNull();
    expect(shareUrl()).toBeNull();
    expect(qr()).toBeNull();
    // What was typed is still there for the retry.
    expect((screen.getByLabelText(t("recipeTitle", "en")) as HTMLInputElement).value).toBe(TEST_IDEA.title);

    fireEvent.click(screen.getByRole("button", { name: t("retry", "en") }));
    expect(await screen.findByText(t("published", "en"))).toBeTruthy();
    expect(create).toHaveBeenCalledTimes(2);
    expect(shareUrl()).not.toBeNull();
  });

  it("publishes once however many times the button is tapped", async () => {
    const pending = deferred<Recipe>();
    create.mockReturnValue(pending.promise);
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    const form = publishButton().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(screen.getByRole("button", { name: t("publishing", "en") })).toHaveProperty("disabled", true);
    expect(shareUrl()).toBeNull();
    pending.resolve(TEST_RECIPE);
    await screen.findByText(t("published", "en"));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("says so when the server kept the recipe as a draft instead of making it public", async () => {
    create.mockResolvedValue({ ...TEST_RECIPE, status: "draft" });
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    fireEvent.click(publishButton());
    expect((await screen.findByRole("status")).textContent).toContain("draft");
    expect(screen.queryByText(t("published", "en"))).toBeNull();
    expect(shareUrl()).toBeNull();
    expect(qr()).toBeNull();
  });

  it("warns when the recipe only lives in temporary demo storage", async () => {
    create.mockResolvedValue(TEST_RECIPE);
    health.mockResolvedValue(HEALTH_NO_DB);
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    fireEvent.click(publishButton());
    expect(await screen.findByText(t("tempStorageRecipe", "en"))).toBeTruthy();
  });

  it("publishes a sample idea with the sample flag, and says so before and after", async () => {
    create.mockResolvedValue({ ...TEST_RECIPE, sample: true });
    render(<RecipePublisher idea={TEST_IDEA} sample lang="en" />);
    open();
    expect(screen.getByText(t("samplePublishNote", "en"))).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(publishButton());
    expect(await screen.findByText(t("published", "en"))).toBeTruthy();
    expect(create.mock.calls[0][0]).toMatchObject({ sample: true });
    expect(screen.getByText(t("madeFromSample", "en"))).toBeTruthy();
  });

  it("does not mark a real idea as a sample", async () => {
    create.mockResolvedValue(TEST_RECIPE);
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    expect(screen.queryByText(t("samplePublishNote", "en"))).toBeNull();
    fireEvent.click(publishButton());
    await screen.findByText(t("published", "en"));
    expect(create.mock.calls[0][0]).not.toHaveProperty("sample");
  });

  it("adds a position only when asked, rounded to about ten metres", async () => {
    create.mockResolvedValue(TEST_RECIPE);
    const geo = stubGeolocation({ lat: 45.757512345, lng: 21.229876543 });
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    expect(geo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("addPosition", "en") }));
    expect(await screen.findByText(/45\.7575, 21\.2299/)).toBeTruthy();
    fireEvent.click(publishButton());
    await screen.findByText(t("published", "en"));
    expect(create.mock.calls[0][0]).toMatchObject({ lat: 45.7575, lng: 21.2299 });
  });

  it("still publishes when the position is refused", async () => {
    create.mockResolvedValue(TEST_RECIPE);
    stubGeolocation("denied");
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="en" />);
    open();
    fireEvent.click(screen.getByRole("button", { name: t("addPosition", "en") }));
    expect(await screen.findByText(t("positionDenied", "en"))).toBeTruthy();
    fireEvent.click(publishButton());
    await screen.findByText(t("published", "en"));
    expect(create.mock.calls[0][0]).not.toHaveProperty("lat");
  });

  it("explains sign-in and unreachable-server failures differently", async () => {
    create.mockRejectedValueOnce(new ApiFailure(401, "unauthorized")).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<RecipePublisher idea={TEST_IDEA} sample={false} lang="ro" />);
    fireEvent.click(screen.getByRole("button", { name: t("makeRecipe", "ro") }));
    fireEvent.click(screen.getByRole("button", { name: t("publish", "ro") }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(t("errAuth", "ro")));
    fireEvent.click(screen.getByRole("button", { name: t("retry", "ro") }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(t("errNetwork", "ro")));
    expect(shareUrl()).toBeNull();
  });
});

describe("publishError", () => {
  it("maps what went wrong to a message", () => {
    expect(publishError(new ApiFailure(501, "not_configured"))).toBe("errNotConfigured");
    expect(publishError(new ApiFailure(403, "forbidden"))).toBe("errAuth");
    expect(publishError(new ApiFailure(405, "request_failed"))).toBe("errMissing");
    expect(publishError(new ApiFailure(429, "rate_limited"))).toBe("errRate");
    expect(publishError(new ApiFailure(400, "bad_request"))).toBe("errRejected");
    expect(publishError(new ApiFailure(500, "request_failed"))).toBe("errServer");
    expect(publishError(new TypeError("Failed to fetch"))).toBe("errNetwork");
    // A 2xx answer that does not match the contract cannot be trusted as a save.
    expect(publishError(new Error("invalid response"))).toBe("errUnconfirmed");
  });
});
