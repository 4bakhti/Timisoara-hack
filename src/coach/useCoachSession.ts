"use client";

/**
 * The one hook a screen needs to run a coaching session.
 *
 *   const session = useCoachSession({ video, overlay, idea, mode, lang, onCapture });
 *   session.phase, session.score, session.instruction, session.captureNow()
 *
 * Give it the playing <video> and a <canvas> laid over it; it tracks, draws the
 * guides, speaks, and calls onCapture when the shot matches (or on captureNow()).
 * Without a camera, pass `still` (a picture) instead of `video`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createEngine } from "./engine";
import { cancelCoachSpeech } from "./engineShared";
import { INITIAL_COACH_STATE, type CoachSession, type CoachSessionOptions, type CoachState, type Engine } from "./types";

class CoachStore {
  private state: CoachState = INITIAL_COACH_STATE;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get = () => this.state;

  /** Only notifies when something a screen can show has changed. */
  set = (patch: Partial<CoachState>) => {
    const next = { ...this.state, ...patch };
    const prev = this.state;
    const same =
      next.phase === prev.phase &&
      next.score === prev.score &&
      next.countdown === prev.countdown &&
      next.personVisible === prev.personVisible &&
      next.simulated === prev.simulated &&
      next.error === prev.error &&
      next.instruction?.id === prev.instruction?.id &&
      next.instruction?.text === prev.instruction?.text &&
      next.instruction?.to === prev.instruction?.to &&
      next.parts.pose === prev.parts.pose &&
      next.parts.framing === prev.parts.framing &&
      next.parts.level === prev.parts.level &&
      Math.abs(next.fps - prev.fps) < 3 &&
      JSON.stringify(next.debug) === JSON.stringify(prev.debug);
    if (same) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  };

  reset = () => {
    this.state = INITIAL_COACH_STATE;
    this.listeners.forEach((l) => l());
  };
}

export function useCoachSession(options: CoachSessionOptions): CoachSession {
  const { video, overlay, idea, mode, lang, speech, target, paused = false, engine: engineKind = "auto" } = options;
  const still = video ? null : (options.still ?? null);
  const mirrored = options.mirrored ?? false;
  const voice = options.voice ?? true;

  const store = useMemo(() => new CoachStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);

  const engineRef = useRef<Engine | null>(null);
  const onCaptureRef = useRef(options.onCapture);
  useEffect(() => {
    onCaptureRef.current = options.onCapture;
  }, [options.onCapture]);

  // Bumping this restarts the session with the same options.
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (paused || (!video && !still)) return;
    let cancelled = false;
    let engine: Engine | null = null;
    store.reset();

    const begin = (source: HTMLVideoElement | HTMLImageElement) => {
      if (cancelled) return;
      engine = createEngine(
        {
          source,
          overlay,
          idea,
          mode,
          lang,
          mirrored,
          voice,
          speech,
          target,
          emit: (patch) => {
            const previous = store.get().phase;
            if ((previous === "holding" || previous === "countdown") &&
                patch.phase && !["holding", "countdown", "captured"].includes(patch.phase)) {
              cancelCoachSpeech({ speech });
            }
            store.set(patch);
          },
          onCapture: (shot) => onCaptureRef.current(shot),
        },
        engineKind,
      );
      engineRef.current = engine;
      engine.start();
    };

    if (video) {
      begin(video);
    } else if (still) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => begin(image);
      image.onerror = () => {
        if (!cancelled) store.set({ phase: "error", error: "image_load_failed" });
      };
      image.src = still;
    }

    return () => {
      cancelled = true;
      engine?.stop();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [video, still, overlay, idea, mode, lang, mirrored, voice, speech, target, paused, engineKind, store, run]);

  const captureNow = useCallback(() => { void engineRef.current?.captureNow(); }, []);
  const requestCapture = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted || paused) return { ok: false, reason: "stale" } as const;
    const stream = video?.srcObject;
    const hasLiveTrack = typeof MediaStream !== "undefined" && stream instanceof MediaStream && stream.getVideoTracks().some((track) => track.readyState === "live");
    if (!video || video.paused || !hasLiveTrack || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return { ok: false, reason: "camera_not_ready" } as const;
    }
    const { phase } = store.get();
    if (phase === "holding" || phase === "countdown") {
      return { ok: false, reason: "capture_in_progress" } as const;
    }
    if (phase === "captured") return { ok: false, reason: "already_captured" } as const;
    return engineRef.current?.captureNow(signal) ?? { ok: false, reason: "camera_not_ready" } as const;
  }, [paused, store, video]);
  const cancelPendingCapture = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
  }, []);
  const restart = useCallback(() => setRun((n) => n + 1), []);

  return { ...state, captureNow, requestCapture, cancelPendingCapture, restart };
}
