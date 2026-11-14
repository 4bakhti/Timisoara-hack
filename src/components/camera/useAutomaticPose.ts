"use client";

import { useEffect, useState } from "react";
import type { ShotIdea } from "@/lib/contracts";
import { PoseResponse } from "@/lib/pose";
import { grabFrame, type FrameSource } from "@/vision/frame";

/** A tiny local comparison; only a changed scene goes back to the server. */
export function sceneChanged(before: Uint8ClampedArray, after: Uint8ClampedArray): boolean {
  if (before.length !== after.length || !before.length) return true;
  let distance = 0;
  for (let i = 0; i < before.length; i += 4) {
    distance += Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]);
  }
  return distance / (before.length / 4 * 3 * 255) > .16;
}

function fingerprint(source: FrameSource): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(source, 0, 0, 16, 16);
  return ctx.getImageData(0, 0, 16, 16).data;
}

export function useAutomaticPose(source: FrameSource | null, enabled: boolean) {
  const [idea, setIdea] = useState<ShotIdea | null>(null);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    // Discard the previous external request result when its source is replaced.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdea(null);
    setUnavailable(false);
    setPending(false);
    if (!source || !enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let previous: Uint8ClampedArray | null = null;
    let hasPerson = false;
    const check = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(check, 1000);
        return;
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const current = fingerprint(source);
        if (previous && hasPerson && !sceneChanged(previous, current)) return;
        setPending(true);
        // A previous target is no longer trustworthy after the scene changes.
        setIdea(null);
        controller = new AbortController();
        timeout = setTimeout(() => controller?.abort(), 18_000);
        const frame = await grabFrame(source, { maxSide: 768, quality: .78 });
        if (stopped) return;
        const response = await fetch("/api/pose", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: frame.dataUrl, lang: navigator.language.startsWith("ro") ? "ro" : "en" }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("pose_unavailable");
        const answer = PoseResponse.parse(await response.json());
        if (stopped) return;
        previous = current;
        hasPerson = Boolean(answer.idea);
        setIdea(answer.idea);
        setUnavailable(false);
      } catch {
        if (!stopped) { setUnavailable(true); hasPerson = false; }
      } finally {
        clearTimeout(timeout);
        if (!stopped) {
          setPending(false);
          // Serial requests, no overlapping frame uploads. Keep a chosen pose steady.
          timer = setTimeout(check, 20_000);
        }
      }
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, [source, enabled]);
  return { idea, pending, unavailable };
}
