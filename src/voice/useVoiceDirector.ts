"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CoachSpeech } from "@/coach";
import { createVoiceDirector } from "./director";
import type { VoiceActions } from "./types";

export function useVoiceDirector(actions: VoiceActions) {
  const [director] = useState(() => createVoiceDirector(actions));
  useEffect(() => { director.setActions(actions); }, [actions, director]);
  const state = useSyncExternalStore(director.subscribe, director.getState, director.getState);
  const speech = useMemo<CoachSpeech>(() => ({
    say: director.deliverCorrection,
    cancel: director.cancelSpeech,
  }), [director]);

  useEffect(() => {
    void director.checkAvailability();
    const close = () => { void director.end(); };
    window.addEventListener("pagehide", close);
    return () => {
      window.removeEventListener("pagehide", close);
      close();
    };
  }, [director]);

  return { director, state, speech };
}
