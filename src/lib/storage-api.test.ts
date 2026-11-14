import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { SAMPLE_PLAN_PERSON } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());
it("distinguishes missing IDs from a missing service or invalid response", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  fetch.mockResolvedValueOnce(Response.json({ error: "not_found" }, { status: 404 }));
  expect(await api.recipes.load("missing")).toEqual({ status: "not_found" });
  fetch.mockResolvedValueOnce(new Response("route missing", { status: 404 }));
  expect(await api.recipes.load("missing")).toEqual({ status: "unavailable" });
  fetch.mockResolvedValueOnce(Response.json({ error: "storage_unavailable" }, { status: 503 }));
  expect(await api.recipes.load("missing")).toEqual({ status: "unavailable" });
  fetch.mockResolvedValueOnce(Response.json({ title: "invalid" }));
  expect(await api.recipes.load("missing")).toEqual({ status: "unavailable" });
});
it("distinguishes an empty list from unavailable storage", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  fetch.mockResolvedValueOnce(Response.json([]));
  expect(await api.recipes.listResult()).toEqual({ status: "ok", recipes: [] });
  fetch.mockRejectedValueOnce(new TypeError("offline"));
  expect(await api.recipes.listResult()).toEqual({ status: "unavailable" });
});
it("loads a recipe and records a use only on an explicit call", async () => {
  const item = { id: "recipe", title: "Portrait", idea: SAMPLE_PLAN_PERSON.ideas[0], status: "public", uses: 0, createdAt: new Date().toISOString() };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(item)).mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  expect(await api.recipes.load("recipe")).toEqual({ status: "ok", recipe: item });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await api.recipes.use("recipe")).toBe(true);
  expect(fetch).toHaveBeenLastCalledWith("/api/recipes/recipe/use", { method: "POST" });
});
it("returns real stats, encodes round labels and handles outages", async () => {
  const stats = { versions: [], votes: { total: 0, preferredAfter: 0 }, storage: "memory" };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(stats)).mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  expect(await api.statsResult("round 1")).toEqual({ status: "ok", stats });
  expect(fetch).toHaveBeenCalledWith("/api/stats?round=round%201", { cache: "no-store" });
  expect(await api.statsResult()).toEqual({ status: "unavailable" });
});
