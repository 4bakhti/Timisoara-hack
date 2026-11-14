import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Recipe, Stats, type Recipe as RecipeType } from "@/lib/contracts";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { READY_SCORE } from "@/coach/brain";
import { MemoryStore } from "./memory";
import { firstReadyMs } from "./metrics";
import { migrate } from "./migrations";
import { createPool, PostgresStore, withLibpqSslMode } from "./postgres";
import { newRecipeId } from "./recipes";
import type { Store } from "./types";

const recipe = (id = newRecipeId(), status: RecipeType["status"] = "public"): RecipeType => ({
  id, title: "Window portrait", idea: SAMPLE_PLAN_PERSON.ideas[0], status, uses: 0,
  createdAt: new Date().toISOString(), sample: true,
});
const event = (sessionId: string, readyAt: number | null, round = "pilot") => ({
  sessionId, appVersion: "v1", outcome: "captured" as const, round,
  events: readyAt === null ? [{ t: 100, score: 20 }] : [{ t: readyAt, score: READY_SCORE }],
});

function storeBehavior(makeStore: () => Promise<Store>) {
  let store: Store;
  beforeEach(async () => { store = await makeStore(); });

  it("keeps retried sessions and feedback idempotent, with last feedback winning", async () => {
    await Promise.all([store.recordEvents(event("one", 1000)), store.recordEvents(event("one", 1000))]);
    await store.saveFeedback({ sessionId: "one", appVersion: "v1", rating: 1 });
    await store.saveFeedback({ sessionId: "one", appVersion: "v1", rating: 5 });
    const stats = Stats.parse(await store.stats());
    expect(stats.versions[0]).toMatchObject({ sessions: 1, captured: 1, ratings: 1, avgRating: 5, avgScoreGain: null });
    expect(stats.votes).toEqual({ total: 0, preferredAfter: 0 });
  });

  it("computes an even median, measured gains and a round filter", async () => {
    await store.recordEvents(event("one", 1000));
    await store.recordEvents(event("two", 3000));
    await store.recordEvents(event("three", 99000, "other"));
    await store.saveFeedback({ sessionId: "one", appVersion: "v1", rating: 4, beforeTotal: 40, afterTotal: 70, round: "pilot" });
    await store.saveFeedback({ sessionId: "two", appVersion: "v1", rating: 2, round: "pilot" });
    const stats = await store.stats("pilot");
    expect(stats.versions[0]).toMatchObject({ sessions: 2, captured: 2, medianSecondsToMatch: 2, ratings: 2, avgRating: 3, avgScoreGain: 30 });
    expect((await store.stats("missing")).versions).toEqual([]);
  });

  it("returns null for unmeasured values and counts abandoned sessions truthfully", async () => {
    await store.recordEvents({ ...event("one", null), outcome: "abandoned" });
    expect((await store.stats()).versions[0]).toMatchObject({ sessions: 1, captured: 0, medianSecondsToMatch: null, avgRating: null, avgScoreGain: null, ratings: 0 });
  });

  it("does not conflate versions or feedback-only rows", async () => {
    await store.recordEvents(event("one", 0));
    await store.saveFeedback({ sessionId: "two", appVersion: "v2", rating: 3 });
    const stats = await store.stats();
    expect(stats.versions.find(row => row.appVersion === "v2")).toMatchObject({ sessions: 0, ratings: 1 });
    expect(stats.versions.find(row => row.appVersion === "v1")).toMatchObject({ sessions: 1, ratings: 0, medianSecondsToMatch: 0 });
  });

  it("lists only public recipes, never counts GETs, and hides existing recipes", async () => {
    const publicRecipe = recipe();
    await store.insertRecipe(publicRecipe);
    await store.insertRecipe(recipe(undefined, "draft"));
    await store.insertRecipe(recipe(undefined, "hidden"));
    expect(await store.insertRecipe(publicRecipe)).toBe(false);
    expect((await store.listRecipes()).length).toBe(1);
    expect(Recipe.parse(await store.getRecipe(publicRecipe.id)).uses).toBe(0);
    expect(await store.useRecipe(publicRecipe.id)).toBe(true);
    expect((await store.getRecipe(publicRecipe.id))?.uses).toBe(1);
    expect(await store.hideRecipe(publicRecipe.id)).toBe(true);
    expect(await store.getRecipe(publicRecipe.id)).toBeNull();
    expect(await store.listRecipes()).toEqual([]);
    expect(await store.useRecipe(publicRecipe.id)).toBe(false);
    expect(await store.hideRecipe("unknown")).toBe(false);
  });

  it("sorts geolocated recipes nearest first and leaves missing locations last", async () => {
    const far = { ...recipe(), lat: 0, lng: 0 };
    const near = { ...recipe(), lat: 45.75, lng: 21.23 };
    const missing = recipe();
    for (const item of [far, missing, near]) await store.insertRecipe(item);
    expect((await store.listRecipes({ lat: 45.75, lng: 21.23 })).map(item => item.id)).toEqual([near.id, far.id, missing.id]);
  });
}

describe("withLibpqSslMode", () => {
  it("gives sslmode=require its libpq meaning and leaves the rest of the address untouched", () => {
    const tiger = "postgres://tsdbadmin:p%40ss@abc.tsdb.cloud.timescale.com:35289/tsdb?sslmode=require";
    expect(withLibpqSslMode(tiger)).toBe(`${tiger}&uselibpqcompat=true`);
    expect(withLibpqSslMode("postgres://u:p@h/db?sslmode=prefer")).toBe("postgres://u:p@h/db?sslmode=prefer&uselibpqcompat=true");
  });

  it("keeps full checking, an explicit choice, no TLS mode and unreadable addresses as they are", () => {
    for (const address of [
      "postgres://u:p@h/db?sslmode=verify-full",
      "postgres://u:p@h/db?sslmode=require&uselibpqcompat=false",
      "postgres://u:p@h/db",
      "not a url",
    ]) {
      expect(withLibpqSslMode(address)).toBe(address);
    }
  });
});

describe("MemoryStore", () => {
  storeBehavior(async () => new MemoryStore());
  it("bounds sessions, feedback and recipes by evicting the oldest entries", async () => {
    const store = new MemoryStore({ sessions: 1, feedback: 1, recipes: 1 });
    for (const id of ["one", "two"]) {
      await store.recordEvents(event(id, null, id));
      await store.saveFeedback({ sessionId: id, appVersion: "v1", rating: 5, round: id });
      await store.insertRecipe(recipe(id));
    }
    expect((await store.stats("one")).versions).toEqual([]);
    expect((await store.stats("two")).versions[0]).toMatchObject({ sessions: 1, ratings: 1 });
    expect(await store.getRecipe("one")).toBeNull();
    expect((await store.listRecipes()).map(item => item.id)).toEqual(["two"]);
  });
  it("returns copies so a caller cannot mutate stored recipes", async () => {
    const store = new MemoryStore(), item = recipe();
    await store.insertRecipe(item);
    item.title = "changed";
    const loaded = await store.getRecipe(item.id);
    loaded!.title = "changed again";
    expect((await store.getRecipe(item.id))?.title).toBe("Window portrait");
  });
});

it("uses the earliest threshold crossing, including unsorted events", () => {
  expect(firstReadyMs([{ t: 3000, score: READY_SCORE }, { t: 1000, score: READY_SCORE }, { t: 0, score: 10 }])).toBe(1000);
});
it("generates 16-character base62 IDs without collisions in a smoke sample", () => {
  const ids = Array.from({ length: 1000 }, newRecipeId);
  expect(ids.every(id => /^[A-Za-z0-9]{16}$/.test(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});

// Explicit opt-in only. Use a throwaway schema inside the supplied TEST database.
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgresStore (explicit TEST_DATABASE_URL)", () => {
  const schema = `fw_test_${randomUUID().replaceAll("-", "")}`;
  let connectionString: string;
  let pool: ReturnType<typeof createPool>;
  const stores: PostgresStore[] = [];
  beforeAll(async () => {
    const base = createPool(databaseUrl!);
    try { await base.query(`CREATE SCHEMA "${schema}"`); } finally { await base.end(); }
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    connectionString = url.toString();
    pool = createPool(connectionString);
    await migrate(pool);
    await migrate(pool); // A second run must not recreate the schema.
  });
  afterAll(async () => {
    await Promise.all(stores.map(store => store.close()));
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });
  storeBehavior(async () => {
    await pool.query("TRUNCATE coach_events, coach_sessions, feedback, recipes");
    const store = new PostgresStore(connectionString); stores.push(store); return store;
  });
  it("persists a recipe across independent store instances", async () => {
    const first = new PostgresStore(connectionString), item = recipe();
    await first.insertRecipe(item);
    await first.close();
    const second = new PostgresStore(connectionString);
    try { expect(await second.getRecipe(item.id)).toEqual(item); } finally { await second.close(); }
  });
});
