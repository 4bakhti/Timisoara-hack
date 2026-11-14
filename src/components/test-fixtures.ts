/**
 * Test-only data. Imported by *.test.tsx files and by nothing else: no screen
 * ever shows these. They are made-up values for checking how the interface
 * behaves, not results from real users.
 */
import type { Health, Recipe, ShotIdea, Stats } from "@/lib/contracts";
import { SAMPLE_PLAN_OBJECT, SAMPLE_PLAN_PERSON } from "@/lib/fixtures";

export const TEST_IDEA: ShotIdea = SAMPLE_PLAN_PERSON.ideas[0];
export const TEST_IDEA_NO_PERSON: ShotIdea = SAMPLE_PLAN_OBJECT.ideas[0];

export const TEST_RECIPE: Recipe = {
  id: "abc123",
  title: "Test recipe by the window",
  idea: TEST_IDEA,
  place: "Test square",
  status: "public",
  uses: 0,
  createdAt: "2026-11-14T08:00:00.000Z",
};

export const HEALTH_NO_DB: Health = { gemini: false, voice: false, db: false, auth: false, preview: false, stamp: false };
export const HEALTH_WITH_DB: Health = { ...HEALTH_NO_DB, db: true };

/** One version with everything measured, one with nothing measurable yet. */
export const TEST_STATS: Stats = {
  versions: [
    { appVersion: "0.1.0", sessions: 12, captured: 9, medianSecondsToMatch: 41.5, avgScoreGain: 17.25, avgRating: 4.2, ratings: 5 },
    { appVersion: "0.0.9", sessions: 3, captured: 0, medianSecondsToMatch: null, avgScoreGain: null, avgRating: null, ratings: 0 },
  ],
  votes: { total: 0, preferredAfter: 0 },
};

/** A promise the test resolves by hand, to look at the screen while a request is still out. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
