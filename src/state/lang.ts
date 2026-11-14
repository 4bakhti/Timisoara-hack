"use client";

/**
 * The interface language, shared by every screen and remembered on this device.
 *
 * Until someone picks a language it follows the browser: Romanian when the
 * browser is set to Romanian, English otherwise. The choice is kept in the
 * browser's own storage and never sent anywhere.
 */
import { useEffect, useSyncExternalStore } from "react";
import { APP_NAME } from "@/lib/brand";
import type { Lang } from "@/lib/contracts";

const STORAGE_KEY = `${APP_NAME.toLowerCase()}.lang`;
const listeners = new Set<() => void>();
let current: Lang | null = null;

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ro") return saved;
  } catch {
    // Storage can be blocked (private windows). The browser language still applies.
  }
  return window.navigator.language?.toLowerCase().startsWith("ro") ? "ro" : "en";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Lang {
  current ??= detect();
  return current;
}

/** The server cannot know the browser's language, so pages are first drawn in English. */
function getServerSnapshot(): Lang {
  return "en";
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not remembered for next time; the choice still applies to this visit.
  }
  listeners.forEach((listener) => listener());
}

/** The current language. Also keeps the page's `lang` attribute right for screen readers. */
export function useLang(): Lang {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return lang;
}
