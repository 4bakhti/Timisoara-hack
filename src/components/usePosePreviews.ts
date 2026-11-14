"use client";

/**
 * AI pose previews for the three ideas: the same person, in the same scene, in
 * each suggested pose. Requested in parallel once a real reading of the scene
 * has arrived; never for sample ideas, recipes or the demo.
 *
 * If the server has no image model (or no quota), nothing is requested and the
 * idea cards keep their drawings.
 */
import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Lang, ShotIdea } from "@/lib/contracts";

export type PreviewState = { status: "loading" } | { status: "ready"; image: string } | { status: "failed" };

export function usePosePreviews() {
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  /** Bumped for every new scene, so answers for an earlier scene are dropped. */
  const runRef = useRef(0);

  const request = useCallback(async (image: string, ideas: ShotIdea[], lang: Lang) => {
    const run = ++runRef.current;
    setPreviews({});
    const wanted = ideas.filter((idea) => idea.subject);
    if (!wanted.length) return;
    const health = await api.health();
    if (runRef.current !== run || !health.preview) return;
    setPreviews(Object.fromEntries(wanted.map((idea) => [idea.id, { status: "loading" } as PreviewState])));
    await Promise.all(
      wanted.map(async (idea) => {
        const answer = await api.preview({ image, idea, lang });
        if (runRef.current !== run) return;
        setPreviews((current) => ({
          ...current,
          [idea.id]: answer && !answer.mock ? { status: "ready", image: answer.image } : { status: "failed" },
        }));
      }),
    );
  }, []);

  const clear = useCallback(() => {
    runRef.current += 1;
    setPreviews({});
  }, []);

  return { previews, request, clear };
}
