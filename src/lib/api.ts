/**
 * Typed client for the app's own API routes. Screens call these functions and
 * never use fetch directly.
 *
 * Every response is checked against the shared contracts. When a route is missing
 * or fails, the calls that have sample data fall back to it and set `mock: true`,
 * so the app keeps working in a demo and the interface can label the result as
 * sample data.
 */
import type { ZodType } from "zod";
import {
  AnalyzeResponse,
  PoseResponse,
  GuideResponse,
  Health,
  PairCreateResponse,
  PreviewResponse,
  Recipe,
  ReviewResponse,
  Stats,
  VotePair,
  VoiceSessionAccess,
  type AnalyzeRequest,
  type EventsRequest,
  type FeedbackRequest,
  type GuideRequest,
  type PairCreateRequest,
  type PreviewRequest,
  type RecipeCreateRequest,
  type ReviewRequest,
  type SpeakRequest,
  type VoteRequest,
} from "./contracts";
import { samplePlan, sampleReview } from "./fixtures";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`${status} ${code}`);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? "request_failed";
  } catch {
    return "request_failed";
  }
}

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new ApiFailure(res.status, await readError(res));
  return schema.parse(await res.json());
}

function post<T>(path: string, body: unknown, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  return request(path, schema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

const NOTHING_CONFIGURED: Health = {
  gemini: false,
  voice: false,
  db: false,
  auth: false,
  preview: false,
  stamp: false,
};

export type RecipeLoadResult =
  | { status: "ok"; recipe: Recipe }
  | { status: "not_found" }
  | { status: "unavailable" };
export type RecipeListResult = { status: "ok"; recipes: Recipe[] } | { status: "unavailable" };
export type StatsResult = { status: "ok"; stats: Stats } | { status: "unavailable" };

export const api = {
  /** Which optional services the server has. Never throws. */
  async health(): Promise<Health> {
    try {
      return await request("/api/health", Health);
    } catch {
      return NOTHING_CONFIGURED;
    }
  },

  /** Reads the scene and plans three shots. Falls back to sample data. */
  async analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    try {
      return await post("/api/analyze", req, AnalyzeResponse);
    } catch {
      return { plan: samplePlan(req.lang), mock: true };
    }
  },

  /** The best poses for the person in this camera photo, best first; null when the AI cannot answer. */
  async pose(image: string, signal?: AbortSignal): Promise<string[] | null> {
    try {
      return (await post("/api/pose", { image }, PoseResponse, signal)).poses;
    } catch {
      return null;
    }
  },

  /** One correction for a scene without a trackable person. Falls back to "no advice". */
  async guide(req: GuideRequest): Promise<GuideResponse> {
    try {
      return await post("/api/guide", req, GuideResponse);
    } catch {
      return { match: 50, fix: null, mock: true };
    }
  },

  /** What improved between the two photos, and one lesson. Falls back to sample data. */
  async review(req: ReviewRequest): Promise<ReviewResponse> {
    try {
      return await post("/api/review", req, ReviewResponse);
    } catch {
      return { ...sampleReview(req.lang), mock: true };
    }
  },

  /** An AI sketch of the proposed shot, or null when the feature is unavailable. */
  async preview(req: PreviewRequest): Promise<PreviewResponse | null> {
    try {
      return await post("/api/preview", req, PreviewResponse);
    } catch {
      return null;
    }
  },

  /** Spoken audio for free text, or null when the server voice is unavailable. */
  async speak(req: SpeakRequest, signal?: AbortSignal): Promise<Blob | null> {
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal,
      });
      if (!res.ok || !res.headers.get("content-type")?.startsWith("audio/")) return null;
      return await res.blob();
    } catch {
      return null;
    }
  },

  /** Request fresh conversation access immediately before connecting. */
  voiceSession(signal?: AbortSignal): Promise<VoiceSessionAccess> {
    return request("/api/voice/session", VoiceSessionAccess, { method: "POST", cache: "no-store", signal });
  },

  /** Usage numbers for the results dashboard. Fire-and-forget; never throws. */
  async events(req: EventsRequest): Promise<void> {
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        keepalive: true,
      });
    } catch {
      // Losing a batch of numbers must never interrupt coaching.
    }
  },

  async feedback(req: FeedbackRequest): Promise<boolean> {
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** A before/after pair to vote on, or null when there is none. */
  async votePair(): Promise<VotePair | null> {
    try {
      return await request("/api/votes", VotePair);
    } catch {
      return null;
    }
  },

  /** Offers a before/after pair for blind voting. Only call with the user's consent. */
  async createPair(req: PairCreateRequest): Promise<string | null> {
    try {
      return (await post("/api/pairs", req, PairCreateResponse)).pairId;
    } catch {
      return null;
    }
  },

  async vote(req: VoteRequest): Promise<boolean> {
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async stats(): Promise<Stats | null> {
    try {
      return await request("/api/stats", Stats);
    } catch {
      return null;
    }
  },

  async statsResult(round?: string): Promise<StatsResult> {
    try {
      const query = round === undefined ? "" : `?round=${encodeURIComponent(round)}`;
      const stats = await request(`/api/stats${query}`, Stats, { cache: "no-store" });
      return { status: "ok", stats };
    } catch {
      return { status: "unavailable" };
    }
  },

  recipes: {
    async use(id: string): Promise<boolean> {
      try {
        return (await fetch(`/api/recipes/${encodeURIComponent(id)}/use`, { method: "POST" })).ok;
      } catch {
        return false;
      }
    },
    async load(id: string): Promise<RecipeLoadResult> {
      try {
        const recipe = await request(`/api/recipes/${encodeURIComponent(id)}`, Recipe, { cache: "no-store" });
        return { status: "ok", recipe };
      } catch (error) {
        if (error instanceof ApiFailure && error.status === 404 && error.code === "not_found") return { status: "not_found" };
        return { status: "unavailable" };
      }
    },
    async listResult(): Promise<RecipeListResult> {
      try {
        const recipes = await request("/api/recipes", Recipe.array(), { cache: "no-store" });
        return { status: "ok", recipes };
      } catch {
        return { status: "unavailable" };
      }
    },
    /** Public recipes, nearest first when a position is given. */
    async list(near?: { lat: number; lng: number }): Promise<Recipe[]> {
      try {
        const query = near ? `?lat=${near.lat}&lng=${near.lng}` : "";
        return await request(`/api/recipes${query}`, Recipe.array());
      } catch {
        return [];
      }
    },
    async get(id: string): Promise<Recipe | null> {
      try {
        return await request(`/api/recipes/${encodeURIComponent(id)}`, Recipe);
      } catch {
        return null;
      }
    },
    /** Throws ApiFailure (401 when signed out) so the screen can react. */
    create(req: RecipeCreateRequest): Promise<Recipe> {
      return post("/api/recipes", req, Recipe);
    },
  },
};
