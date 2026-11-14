/**
 * Draws the coaching guides on a canvas laid over the camera view:
 * the target box, the pose "ghost" and the live skeleton.
 *
 * The canvas must cover the same rectangle as the <video>, which is assumed to
 * use `object-fit: cover`. If the video is mirrored with CSS (front camera),
 * mirror the canvas the same way; everything here is drawn in unmirrored image
 * coordinates. No text is drawn, so mirroring is safe.
 */
import type { Box, Point2, PosePointName, PosePoints } from "@/lib/contracts";
import { headRadiusFor } from "./poses/build";
import type { Limb, SilhouetteMask } from "./types";

export const BONES: ReadonlyArray<readonly [PosePointName, PosePointName]> = [
  ["lShoulder", "rShoulder"],
  ["lShoulder", "lElbow"],
  ["lElbow", "lWrist"],
  ["rShoulder", "rElbow"],
  ["rElbow", "rWrist"],
  ["lShoulder", "lHip"],
  ["rShoulder", "rHip"],
  ["lHip", "rHip"],
  ["lHip", "lKnee"],
  ["lKnee", "lAnkle"],
  ["rHip", "rKnee"],
  ["rKnee", "rAnkle"],
];

/** Maps normalised image coordinates (0–1) to canvas CSS pixels. */
export interface ViewMap {
  x(nx: number): number;
  y(ny: number): number;
  /** CSS pixels per image pixel. */
  scale: number;
  imgW: number;
  imgH: number;
  viewW: number;
  viewH: number;
}

/** Mapping for an image shown with `object-fit: cover` inside a view. */
export function coverMap(imgW: number, imgH: number, viewW: number, viewH: number): ViewMap {
  const scale = Math.max(viewW / Math.max(imgW, 1), viewH / Math.max(imgH, 1));
  const dx = (viewW - imgW * scale) / 2;
  const dy = (viewH - imgH * scale) / 2;
  return {
    x: (nx) => dx + nx * imgW * scale,
    y: (ny) => dy + ny * imgH * scale,
    scale,
    imgW,
    imgH,
    viewW,
    viewH,
  };
}

/** Pixel positions of a template placed inside a target box (figure fills the box height). */
export function placeTemplate(points: PosePoints, box: Box, map: ViewMap): Record<PosePointName, Point2> {
  const top = map.y(box.y);
  const height = box.h * map.imgH * map.scale;
  const centreX = map.x(box.x + box.w / 2);
  const out = {} as Record<PosePointName, Point2>;
  for (const name of Object.keys(points) as PosePointName[]) {
    const [x, y] = points[name];
    out[name] = [centreX + (x - 0.5) * height, top + y * height];
  }
  return out;
}

export interface GuideFrame {
  map: ViewMap;
  /** Where the subject should be, in normalised image coordinates. */
  targetBox?: Box;
  /** Pose template to draw inside the target box. */
  ghost?: PosePoints;
  /** Live body points in normalised image coordinates. Missing points are skipped. */
  live?: Partial<Record<PosePointName, Point2>>;
  /** 0–100. The ghost turns from white to green as this rises. */
  score?: number;
  /** Phone roll error in degrees; draws a level line when it is a number. */
  levelErrorDeg?: number | null;
  /** The live person's outline. TO BUILD (Person A): a soft glow, green when the score is high. */
  silhouette?: SilhouetteMask;
  /** The target outline from an AI preview, in image coordinates. TO BUILD (Person A): dashed. */
  targetSilhouette?: SilhouetteMask;
  /** Body parts the coach is asking about. TO BUILD (Person A): draw them in a warning colour. */
  highlight?: Limb[];
}

/** Keeps the canvas bitmap in step with its CSS size. Returns the CSS size. */
export function syncCanvas(canvas: HTMLCanvasElement): { width: number; height: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

function ghostColour(score: number, alpha: number): string {
  const t = Math.min(Math.max((score - 40) / 50, 0), 1);
  return `rgba(${mix(255, 74, t)}, ${mix(255, 222, t)}, ${mix(255, 128, t)}, ${alpha})`;
}

export function drawGuides(ctx: CanvasRenderingContext2D, frame: GuideFrame): void {
  const { map } = frame;
  ctx.clearRect(0, 0, map.viewW, map.viewH);
  const score = frame.score ?? 0;

  if (frame.targetBox) drawTargetBox(ctx, frame.targetBox, map, score);

  if (frame.ghost && frame.targetBox) {
    const pts = placeTemplate(frame.ghost, frame.targetBox, map);
    const figureHeight = frame.targetBox.h * map.imgH * map.scale;
    drawFigure(ctx, pts, {
      width: Math.max(4, figureHeight * 0.016),
      colour: ghostColour(score, 0.8),
      headRadius: headRadiusFor(frame.ghost) * figureHeight,
      glow: true,
    });
  }

  if (frame.live) {
    const pts: Partial<Record<PosePointName, Point2>> = {};
    for (const name of Object.keys(frame.live) as PosePointName[]) {
      const p = frame.live[name];
      if (p) pts[name] = [map.x(p[0]), map.y(p[1])];
    }
    drawFigure(ctx, pts, { width: 2.5, colour: "rgba(120, 220, 255, 0.95)", dots: true });
  }

  if (typeof frame.levelErrorDeg === "number") drawLevel(ctx, frame.levelErrorDeg, map);
}

function drawTargetBox(ctx: CanvasRenderingContext2D, box: Box, map: ViewMap, score: number): void {
  const x = map.x(box.x);
  const y = map.y(box.y);
  const w = box.w * map.imgW * map.scale;
  const h = box.h * map.imgH * map.scale;
  const arm = Math.min(w, h) * 0.14;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = ghostColour(score, 0.9);
  ctx.beginPath();
  // Four corner brackets.
  ctx.moveTo(x, y + arm);
  ctx.lineTo(x, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x + w - arm, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + arm);
  ctx.moveTo(x + w, y + h - arm);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - arm, y + h);
  ctx.moveTo(x + arm, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - arm);
  ctx.stroke();
  ctx.restore();
}

interface FigureStyle {
  width: number;
  colour: string;
  headRadius?: number;
  glow?: boolean;
  dots?: boolean;
}

function drawFigure(
  ctx: CanvasRenderingContext2D,
  pts: Partial<Record<PosePointName, Point2>>,
  style: FigureStyle,
): void {
  ctx.save();
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = style.colour;
  ctx.fillStyle = style.colour;
  if (style.glow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = style.width * 1.5;
  }
  ctx.beginPath();
  for (const [a, b] of BONES) {
    const p = pts[a];
    const q = pts[b];
    if (!p || !q) continue;
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
  }
  ctx.stroke();

  const nose = pts.nose;
  if (nose && style.headRadius) {
    ctx.beginPath();
    ctx.arc(nose[0], nose[1], style.headRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (style.dots) {
    for (const p of Object.values(pts)) {
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], style.width * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawLevel(ctx: CanvasRenderingContext2D, errorDeg: number, map: ViewMap): void {
  const cx = map.viewW / 2;
  const cy = map.viewH * 0.5;
  const half = map.viewW * 0.22;
  const ok = Math.abs(errorDeg) < 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.lineTo(half, 0);
  ctx.stroke();
  ctx.rotate((errorDeg * Math.PI) / 180);
  ctx.strokeStyle = ok ? "rgba(74, 222, 128, 0.95)" : "rgba(255, 196, 0, 0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.lineTo(half, 0);
  ctx.stroke();
  ctx.restore();
}
