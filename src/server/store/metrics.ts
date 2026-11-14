import { READY_SCORE } from "@/coach/brain";
import type { EventsRequest } from "@/lib/contracts";

export function firstReadyMs(events: EventsRequest["events"]): number | null {
  let first: number | null = null;
  for (const event of events) {
    if (event.score >= READY_SCORE && (first === null || event.t < first)) first = event.t;
  }
  return first;
}

export const NO_VOTES = { total: 0, preferredAfter: 0 } as const;

/** How far back the hour-by-hour activity on /stats reaches. */
export const ACTIVITY_HOURS = 48;

/** Mean of a sum over a count, or null when nothing was counted. */
export const ratio = (sum: number, count: number) => (count > 0 ? sum / count : null);
