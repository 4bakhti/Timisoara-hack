/** Grabbing still images from the live camera (or from a picture, in demo mode). */

export interface GrabbedFrame {
  blob: Blob;
  /** "data:image/jpeg;base64,..." */
  dataUrl: string;
  width: number;
  height: number;
}

export interface GrabOptions {
  /** Longest side of the result in pixels. Defaults to the source's own resolution. */
  maxSide?: number;
  /** Flip horizontally, to match a mirrored front-camera preview. */
  mirrored?: boolean;
  /** JPEG quality, 0–1. */
  quality?: number;
}

export type FrameSource = HTMLVideoElement | HTMLImageElement;

/** Pixel size of a video frame or an image. Zero when it has not loaded yet. */
export function sourceSize(source: FrameSource): { width: number; height: number } {
  return source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.naturalWidth, height: source.naturalHeight };
}

/** Copies the current frame to a JPEG. Throws if the source has no picture yet. */
export async function grabFrame(source: FrameSource, opts: GrabOptions = {}): Promise<GrabbedFrame> {
  const { width: srcW, height: srcH } = sourceSize(source);
  if (!srcW || !srcH) throw new Error("camera_not_ready");

  const longest = Math.max(srcW, srcH);
  const ratio = opts.maxSide && longest > opts.maxSide ? opts.maxSide / longest : 1;
  const width = Math.round(srcW * ratio);
  const height = Math.round(srcH * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  if (opts.mirrored) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, width, height);

  const quality = opts.quality ?? 0.9;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/jpeg", quality);
  });
  return { blob, dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
}

/** Shrinks an existing image (data URL or blob URL) so its longest side is at most `maxSide`. */
export async function shrinkImage(src: string, maxSide: number, quality = 0.85): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const ratio = longest > maxSide ? maxSide / longest : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * ratio);
  canvas.height = Math.round(img.naturalHeight * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
