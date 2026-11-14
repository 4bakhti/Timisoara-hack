/**
 * The phone's position, asked for only when the user taps a button for it.
 * Nothing here runs on its own, and nothing here sends the position anywhere.
 */
import type { Lang } from "@/lib/contracts";

export interface Located {
  lat: number;
  lng: number;
}

export type LocateFailure = "denied" | "unavailable";

/** Four decimals is about eleven metres: enough to find a spot, not a doorstep. */
const round = (degrees: number) => Math.round(degrees * 10_000) / 10_000;

/** Asks the browser once. Resolves with the reason when there is no position. */
export function locate(): Promise<Located | LocateFailure> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (found) => resolve({ lat: round(found.coords.latitude), lng: round(found.coords.longitude) }),
      (failure) => resolve(failure.code === failure.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export function formatCoords(position: Located): string {
  return `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
}

/** Straight-line distance in metres between two positions. */
export function distanceMeters(a: Located, b: Located): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number, lang: Lang): string {
  const locale = lang === "ro" ? "ro-RO" : "en-GB";
  if (meters < 1000) return `${new Intl.NumberFormat(locale).format(Math.round(meters / 10) * 10)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}
