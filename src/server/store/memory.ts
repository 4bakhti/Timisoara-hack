import type { EventsRequest, FeedbackRequest, Recipe, Stats } from "@/lib/contracts";
import { firstReadyMs, NO_VOTES } from "./metrics";
import type { Position, Store, VersionStats } from "./types";

const DEFAULT_LIMITS = { sessions: 2000, feedback: 5000, recipes: 500 };
type Session = Pick<EventsRequest, "appVersion" | "outcome" | "round"> & { readyMs: number | null };
type Bucket = {
  sessions: number;
  captured: number;
  ready: number[];
  ratings: number[];
  gains: number[];
};

function put<T>(map: Map<string, T>, key: string, value: T, limit: number) {
  map.set(key, value);
  if (map.size > limit) {
    const first = map.keys().next();
    if (!first.done) map.delete(first.value);
  }
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
}

function medianSeconds(values: number[]) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return (values[Math.floor((values.length - 1) / 2)] + values[middle]) / 2000;
}

function proximity(recipe: Recipe, near: Position) {
  if (recipe.lat === undefined || recipe.lng === undefined) return -Infinity;
  const rad = Math.PI / 180;
  return Math.sin(recipe.lat * rad) * Math.sin(near.lat * rad) +
    Math.cos(recipe.lat * rad) * Math.cos(near.lat * rad) * Math.cos((recipe.lng - near.lng) * rad);
}

export class MemoryStore implements Store {
  readonly mode = "memory" as const;
  private readonly sessions = new Map<string, Session>();
  private readonly feedback = new Map<string, FeedbackRequest>();
  private readonly recipes = new Map<string, Recipe>();

  constructor(private readonly limits = DEFAULT_LIMITS) {}

  async recordEvents(request: EventsRequest) {
    if (this.sessions.has(request.sessionId)) return;
    const { appVersion, outcome, round, events } = request;
    // Keep summaries only in demo storage. Raw events are available in Postgres.
    put(this.sessions, request.sessionId, { appVersion, outcome, round, readyMs: firstReadyMs(events) }, this.limits.sessions);
  }

  async saveFeedback(request: FeedbackRequest) {
    put(this.feedback, request.sessionId, { ...request }, this.limits.feedback);
  }

  async stats(round?: string): Promise<Stats> {
    const buckets = new Map<string, Bucket>();
    const bucket = (version: string) => {
      let entry = buckets.get(version);
      if (!entry) {
        entry = { sessions: 0, captured: 0, ready: [], ratings: [], gains: [] };
        buckets.set(version, entry);
      }
      return entry;
    };

    for (const session of this.sessions.values()) {
      if (round !== undefined && session.round !== round) continue;
      const entry = bucket(session.appVersion);
      entry.sessions++;
      if (session.outcome === "captured" || session.outcome === "captured-manually") entry.captured++;
      if (session.readyMs !== null) entry.ready.push(session.readyMs);
    }
    for (const feedback of this.feedback.values()) {
      if (round !== undefined && feedback.round !== round) continue;
      const entry = bucket(feedback.appVersion);
      entry.ratings.push(feedback.rating);
      if (feedback.beforeTotal !== undefined && feedback.afterTotal !== undefined) {
        entry.gains.push(feedback.afterTotal - feedback.beforeTotal);
      }
    }

    const versions: VersionStats[] = [...buckets].map(([appVersion, entry]) => ({
      appVersion,
      sessions: entry.sessions,
      captured: entry.captured,
      medianSecondsToMatch: medianSeconds(entry.ready),
      avgScoreGain: mean(entry.gains),
      avgRating: mean(entry.ratings),
      ratings: entry.ratings.length,
    }));
    versions.sort((a, b) => b.appVersion.localeCompare(a.appVersion));
    return { versions, votes: NO_VOTES, storage: this.mode };
  }

  async insertRecipe(recipe: Recipe) {
    if (this.recipes.has(recipe.id)) return false;
    put(this.recipes, recipe.id, structuredClone(recipe), this.limits.recipes);
    return true;
  }

  async listRecipes(near?: Position) {
    const recipes = [...this.recipes.values()].filter((recipe) => recipe.status === "public");
    recipes.sort((a, b) => (near ? proximity(b, near) - proximity(a, near) : 0) ||
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return structuredClone(recipes.slice(0, 50));
  }

  async getRecipe(id: string) {
    const recipe = this.recipes.get(id);
    return recipe?.status === "public" ? structuredClone(recipe) : null;
  }

  async useRecipe(id: string) {
    const recipe = this.recipes.get(id);
    if (recipe?.status !== "public") return false;
    recipe.uses++;
    return true;
  }

  async hideRecipe(id: string) {
    const recipe = this.recipes.get(id);
    if (!recipe) return false;
    recipe.status = "hidden";
    return true;
  }
}
