import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Recipe, Stats } from "@/lib/contracts";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { MemoryStore } from "./memory";
import { getStore } from "./index";

const storeMock = vi.hoisted(() => vi.fn());
vi.mock("./index", () => ({ getStore: storeMock }));
let store: MemoryStore;
let address = 0;
const body = () => ({ title: "  Window portrait  ", idea: SAMPLE_PLAN_PERSON.ideas[0], place: "  Timisoara\u0000  ", lat: 45.752345, lng: 21.223456, sample: true });
const req = (path: string, data?: unknown, ip = `test-${address}`) => new Request(`https://framewise.test/api/${path}`, {
  method: data === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => { vi.resetModules(); store = new MemoryStore(); vi.mocked(getStore).mockReset().mockReturnValue(store); address++; });
afterEach(() => vi.unstubAllEnvs());

async function create() {
  const { POST } = await import("@/app/api/recipes/route");
  const response = await POST(req("recipes", body()));
  expect(response.status).toBe(201);
  return Recipe.parse(await response.json());
}

describe("storage routes", () => {
  it("confirms a cleaned, rounded public recipe, with no photos stored", async () => {
    const item = await create();
    expect(item).toMatchObject({ title: "Window portrait", place: "Timisoara", lat: 45.7523, lng: 21.2235, status: "public", uses: 0, sample: true });
    expect(item.id).toMatch(/^[A-Za-z0-9]{16}$/);
  });
  it("validates recipe fields and coordinates, rejects oversized bodies", async () => {
    const { POST, GET } = await import("@/app/api/recipes/route");
    for (const change of [{ title: "  " }, { lat: 91 }, { lng: undefined }, { title: "x".repeat(81) }, { idea: {} }]) {
      expect((await POST(req("recipes", { ...body(), ...change }, `bad-${address++}`))).status).toBe(400);
    }
    expect((await POST(req("recipes", { ...body(), extra: "x".repeat(70_000) }, `big-${address++}`))).status).toBe(400);
    for (const query of ["?lat=45", "?lat=&lng=0", "?lat=91&lng=0", "?lat=no&lng=0"]) expect((await GET(req(`recipes${query}`))).status).toBe(400);
  });
  it("limits creation and distinguishes missing recipes", async () => {
    const { POST } = await import("@/app/api/recipes/route");
    for (let i=0; i<5; i++) expect((await POST(req("recipes", body()))).status).toBe(201);
    expect((await POST(req("recipes", body()))).status).toBe(429);
    const { GET } = await import("@/app/api/recipes/[id]/route");
    expect((await GET(req("recipes/missing"), context("missing"))).status).toBe(404);
  });
  it("does not increment on reads, counts explicit use once per address/recipe/window", async () => {
    const item = await create();
    const { GET } = await import("@/app/api/recipes/[id]/route");
    const { POST } = await import("@/app/api/recipes/[id]/use/route");
    for (let i=0; i<2; i++) expect((await GET(req(`recipes/${item.id}`), context(item.id))).status).toBe(200);
    expect((await store.getRecipe(item.id))?.uses).toBe(0);
    expect((await POST(req("use", {}), context(item.id))).status).toBe(200);
    expect((await POST(req("use", {}), context(item.id))).status).toBe(429);
    expect((await store.getRecipe(item.id))?.uses).toBe(1);
    expect((await POST(req("use", {}), context("unknown"))).status).toBe(404);
  });
  it("requires a configured admin token, hides a recipe, then returns 404 publicly", async () => {
    const item = await create();
    const { POST } = await import("@/app/api/recipes/[id]/hide/route");
    vi.stubEnv("RECIPES_ADMIN_TOKEN", "");
    expect((await POST(req("hide", {}), context(item.id))).status).toBe(501);
    vi.stubEnv("RECIPES_ADMIN_TOKEN", "test-only-admin-token");
    expect((await POST(req("hide", {}), context(item.id))).status).toBe(403);
    const hide = req("hide", {}); hide.headers.set("authorization", "Bearer test-only-admin-token");
    expect((await POST(hide, context(item.id))).status).toBe(200);
    const { GET } = await import("@/app/api/recipes/[id]/route");
    expect((await GET(req("recipe"), context(item.id))).status).toBe(404);
    expect(await store.listRecipes()).toEqual([]);
  });
  it("does not acknowledge feedback before writing, cleans comments, and upserts", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const feedback = { sessionId: "one", appVersion: "v1", rating: 4, comment: "  nice\u0000  " };
    const save = vi.spyOn(store, "saveFeedback");
    expect((await POST(req("feedback", feedback))).status).toBe(200);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ comment: "nice" }));
    expect((await POST(req("feedback", { ...feedback, rating: 5 }))).status).toBe(200);
    expect((await store.stats()).versions[0]).toMatchObject({ ratings: 1, avgRating: 5 });
    save.mockRejectedValue(new Error("database offline"));
    expect((await POST(req("feedback", feedback))).status).toBe(503);
  });
  it("validates and rate-limits feedback", async () => {
    const { POST } = await import("@/app/api/feedback/route");
    const feedback = { sessionId: "one", appVersion: "v1", rating: 4 };
    expect((await POST(req("feedback", { ...feedback, rating: 6 }, `invalid-${address}`))).status).toBe(400);
    for (let i=0; i<10; i++) expect((await POST(req("feedback", feedback))).status).toBe(200);
    expect((await POST(req("feedback", feedback))).status).toBe(429);
  });
  it("records events idempotently, validates samples and caps ingestion", async () => {
    const { POST } = await import("@/app/api/events/route");
    const event = { sessionId: "one", appVersion: "v1", outcome: "captured", events: [{ t: 1000, score: 90 }] };
    for(let i=0; i<2; i++) expect((await POST(req("events", event))).status).toBe(200);
    expect((await store.stats()).versions[0]).toMatchObject({ sessions: 1, captured: 1 });
    expect((await POST(req("events", { ...event, events: [{ t: -1, score: 90 }] }))).status).toBe(400);
    expect((await POST(req("events", { ...event, events: Array(601).fill(event.events[0]) }))).status).toBe(400);
    expect((await POST(req("events", { ...event, junk: "x".repeat(65536) }))).status).toBe(400);
    for(let i=0; i<25; i++) await POST(req("events", event));
    expect((await POST(req("events", event))).status).toBe(429);
  });
  it("returns uncached measured stats and respects round filtering", async () => {
    await store.recordEvents({ sessionId: "one", appVersion: "v1", round: "pilot", events: [{ t: 1000, score: 90 }] });
    const { GET } = await import("@/app/api/stats/route");
    const response = await GET(req("stats?round=pilot"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Stats.parse(await response.json())).toMatchObject({ storage: "memory", versions: [{ sessions: 1 }] });
    expect((await GET(req("stats?round="))).status).toBe(400);
    expect((await (await GET(req("stats?round=other"))).json()).versions).toEqual([]);
  });
  it("returns storage_unavailable without leaking errors on every store-dependent route", async () => {
    vi.mocked(getStore).mockImplementation(() => { throw new Error("private connection detail"); });
    vi.stubEnv("RECIPES_ADMIN_TOKEN", "test-only-admin-token");
    const recipes = await import("@/app/api/recipes/route");
    const stats = await import("@/app/api/stats/route");
    const detail = await import("@/app/api/recipes/[id]/route");
    const use = await import("@/app/api/recipes/[id]/use/route");
    const hide = await import("@/app/api/recipes/[id]/hide/route");
    const feedback = await import("@/app/api/feedback/route");
    const events = await import("@/app/api/events/route");
    const authorized = req("hide", {}); authorized.headers.set("authorization", "Bearer test-only-admin-token");
    const responses = await Promise.all([
      recipes.POST(req("recipes", body())), recipes.GET(req("recipes")), stats.GET(req("stats")),
      detail.GET(req("recipe"), context("id")), use.POST(req("use", {}), context("id")), hide.POST(authorized, context("id")),
      feedback.POST(req("feedback", { sessionId: "one", appVersion: "v1", rating: 5 })),
      events.POST(req("events", { sessionId: "one", appVersion: "v1", events: [] })),
    ]);
    for (const response of responses) { expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "storage_unavailable" }); }
  });
});
