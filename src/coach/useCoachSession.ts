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
      next.parts.pose === prev.parts.pose &&
      next.parts.framing === prev.parts.framing &&
      next.parts.level === prev.parts.level &&
      Math.abs(next.fps - prev.fps) < 3;
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
  const { video, overlay, idea, mode, lang, paused = false, engine: engineKind = "auto" } = options;
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
          emit: store.set,
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
      image.onerror = () => store.set({ phase: "error", error: "image_load_failed" });
      image.src = still;
    }

    return () => {
      cancelled = true;
      engine?.stop();
      engineRef.current = null;
    };
  }, [video, still, overlay, idea, mode, lang, mirrored, voice, paused, engineKind, store, run]);

  const captureNow = useCallback(() => engineRef.current?.captureNow(), []);
  const restart = useCallback(() => setRun((n) => n + 1), []);

  return { ...state, captureNow, restart };
}
