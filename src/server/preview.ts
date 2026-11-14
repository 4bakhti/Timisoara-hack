/**
 * Helpers for AI pose previews: reading a photo's size so the preview keeps the
 * same shape, sorting out why an image request failed, and pausing previews
 * when the account's image quota is used up.
 */

/** Width and height from a JPEG or PNG data URL, without decoding the picture. */
export function imageSizeFromDataUrl(dataUrl: string): { width: number; height: number } | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  // The header is near the start; decode only the first few kilobytes.
  const head = Buffer.from(dataUrl.slice(comma + 1, comma + 1 + 87_384), "base64");
  return jpegSize(head) ?? pngSize(head);
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    // Start-of-frame markers carry the size (C4, C8 and CC are other tables).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

/** Aspect ratios the image models accept. */
export const ASPECT_RATIOS = ["9:16", "2:3", "3:4", "1:1", "4:3", "3:2", "16:9", "21:9"] as const;

/** The supported aspect ratio closest to a picture's shape. */
export function nearestAspectRatio(width: number, height: number): (typeof ASPECT_RATIOS)[number] {
  const target = Math.log(width / Math.max(1, height));
  let best: (typeof ASPECT_RATIOS)[number] = "1:1";
  let bestDistance = Infinity;
  for (const ratio of ASPECT_RATIOS) {
    const [w, h] = ratio.split(":").map(Number);
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
}

export type ImageFailure = "quota" | "timeout" | "failed";

/** Why an image request failed, from the error the SDK threw. */
export function classifyImageError(error: unknown): ImageFailure {
  const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : null;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message)) return "quota";
  if (/aborted|timed? ?out|DEADLINE_EXCEEDED|\b504\b/i.test(message)) return "timeout";
  return "failed";
}

/* When the account has no image quota, every request fails the same way. Pause
 * previews for a while instead, so phones stop asking. Per server instance. */
let pausedUntil = 0;

export function pausePreviews(ms: number, now = Date.now()): void {
  pausedUntil = now + ms;
}

export function previewsPaused(now = Date.now()): boolean {
  return now < pausedUntil;
}
