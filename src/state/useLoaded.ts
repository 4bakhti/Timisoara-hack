"use client";

import { useCallback, useEffect, useState } from "react";

export interface Loaded<T> {
  /** The answer of the latest request, or undefined while it is still on its way. */
  value: T | undefined;
  loading: boolean;
  /** Ask again, for example after a failure. */
  reload: () => void;
}

/**
 * Runs `load` when the screen appears and again on `reload()`. An answer that
 * arrives after a newer request was started is dropped, so a slow first try
 * can never overwrite a retry.
 */
export function useLoaded<T>(load: () => Promise<T>): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ attempt: number; value: T } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load().then((value) => {
      if (!cancelled) setAnswer({ attempt, value });
    });
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = answer?.attempt === attempt;
  return { value: current ? answer.value : undefined, loading: !current, reload };
}
