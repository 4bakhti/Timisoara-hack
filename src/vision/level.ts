/**
 * How level the phone is held, from its motion sensor.
 *
 * The reading is the roll away from the nearest upright position (portrait or
 * landscape), in degrees, so it is 0 whenever the horizon would be straight.
 */

type MotionPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Asks for motion-sensor access where the browser requires it (iPhone).
 * Must be called from a tap handler. Resolves true when readings will arrive.
 */
export async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return false;
  const api = DeviceMotionEvent as unknown as MotionPermissionApi;
  if (typeof api.requestPermission !== "function") return true;
  try {
    return (await api.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Roll in degrees from a gravity reading, folded into −45…45 around the nearest upright. */
export function rollFromGravity(gx: number, gy: number): number | null {
  if (Math.hypot(gx, gy) < 2) return null; // Phone lying nearly flat: roll is meaningless.
  const roll = (Math.atan2(gx, gy) * 180) / Math.PI;
  return ((((roll + 45) % 90) + 90) % 90) - 45;
}

/**
 * Reports the roll error as it changes; null when the device gives no reading
 * (desktop, permission refused, or the phone lying flat). Returns a stop function.
 */
export function watchLevel(onChange: (errorDeg: number | null) => void): () => void {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
    onChange(null);
    return () => undefined;
  }
  let smoothed: number | null = null;
  let lastEventAt = 0;

  const onMotion = (event: DeviceMotionEvent) => {
    const g = event.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null) return;
    const roll = rollFromGravity(g.x, g.y);
    lastEventAt = Date.now();
    if (roll === null) {
      smoothed = null;
    } else {
      smoothed = smoothed === null ? roll : smoothed + 0.2 * (roll - smoothed);
    }
    onChange(smoothed === null ? null : Math.round(smoothed * 10) / 10);
  };

  const watchdog = window.setInterval(() => {
    if (Date.now() - lastEventAt > 1500 && smoothed !== null) {
      smoothed = null;
      onChange(null);
    }
  }, 1000);

  window.addEventListener("devicemotion", onMotion);
  onChange(null);
  return () => {
    window.removeEventListener("devicemotion", onMotion);
    window.clearInterval(watchdog);
  };
}
