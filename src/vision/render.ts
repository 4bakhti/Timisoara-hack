/**
 * Draws the coaching guides on a canvas laid over the camera view:
 *
 *  - the target: a soft body shape with a dashed outline. It is the real outline
 *    from an AI preview when there is one, otherwise a volumetric figure built
 *    from the pose template;
 *  - the live person: their traced outline with a soft glow, sky blue while
 *    adjusting and green once the coach says the shot matches;
 *  - the live skeleton: the body part being corrected in red, everything green
 *    once it matches;
 *  - the target box corners and, in friend mode, a level line.
 *
 * The canvas must cover the same rectangle as the <video>, which is assumed to
 * use `object-fit: cover`. If the video is mirrored with CSS (front camera),
 * mirror the canvas the same way; everything here is drawn in unmirrored image
 * coordinates. No text is drawn, so mirroring is safe.
 *
 * Masks, outlines and glows are built once per mask and cached, so a frame only
 * pastes ready-made images and strokes one outline.
 */
import type { Box, Point2, PosePointName, PosePoints } from "@/lib/contracts";
import { figureMask, maskContour, type Polyline } from "./silhouette";
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

/** Which body part each bone belongs to, for colouring. */
export function boneLimb(a: PosePointName, b: PosePointName): Limb {
  const names = [a, b];
  const arm = names.every((n) => /Shoulder|Elbow|Wrist/.test(n)) && !names.every((n) => /Shoulder/.test(n));
  const leg = names.every((n) => /Hip|Knee|Ankle/.test(n)) && !names.every((n) => /Hip/.test(n));
  const left = names.every((n) => n.startsWith("l"));
  const right = names.every((n) => n.startsWith("r"));
  if (arm && left) return "leftArm";
  if (arm && right) return "rightArm";
  if (leg && left) return "leftLeg";
  if (leg && right) return "rightLeg";
  return "torso";
}

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
  minimal?: boolean;
  map: ViewMap;
  /** Where the subject should be, in normalised image coordinates. */
  targetBox?: Box;
  /**
   * Where to draw the target shape: on the live person (see anchoredBox), so it
   * follows them and only the limbs differ. The shape is moved from the target
   * box by its centre, top and height. Defaults to the target box.
   */
  ghostBox?: Box;
  /** Pose template to draw inside the target box (as a body shape). */
  ghost?: PosePoints;
  /** Live body points in normalised image coordinates. Missing points are skipped. */
  live?: Partial<Record<PosePointName, Point2>>;
  /** 0–100. Guides turn from white to green as this rises. */
  score?: number;
  /** Phone roll error in degrees; draws a level line when it is a number. */
  levelErrorDeg?: number | null;
  /** The live person's mask, drawn as a glowing outline. */
  silhouette?: SilhouetteMask;
  /** The target outline from an AI preview, in image coordinates. Replaces the template figure. */
  targetSilhouette?: SilhouetteMask;
  /** Body parts the coach is asking about, drawn in a warning colour. */
  highlight?: Limb[];
  /**
   * true while the coach holds or counts down: everything turns fully green.
   * When absent, a score at or above the match threshold counts as matched.
   */
  matched?: boolean;
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

/* ---------------------------------------------------------------- colours */

/** A score at or above this is a match: everything turns green. */
const MATCH_SCORE = 84;
const GREEN = "rgba(74, 222, 128, 0.98)";
const RED = "rgba(248, 113, 113, 0.98)";
const WHITE = "rgba(255, 255, 255, 0.92)";

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/**
 * How green the guides are: they warm up with the score, but only turn fully
 * green when the coach confirms the match, so that moment stands out.
 */
function greenness(score: number, matched: boolean): number {
  if (matched) return 1;
  return Math.min(0.55, Math.max(0, (score - 40) / 50));
}

/** White → green: the target. */
function guideColour(t: number, alpha: number): string {
  return `rgba(${mix(255, 74, t)}, ${mix(255, 222, t)}, ${mix(255, 128, t)}, ${alpha})`;
}

/** Sky blue → green: the live person, visible on light and dark scenes. */
function liveColour(t: number, alpha: number): string {
  return `rgba(${mix(125, 74, t)}, ${mix(211, 222, t)}, ${mix(252, 128, t)}, ${alpha})`;
}

/* ------------------------------------------------------------------ caches */

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

const maskCanvases = new WeakMap<SilhouetteMask, Record<"white" | "green", HTMLCanvasElement>>();

/** The mask as solid-colour canvases (alpha from the mask), for fills. */
function maskFills(mask: SilhouetteMask): Record<"white" | "green", HTMLCanvasElement> {
  let cached = maskCanvases.get(mask);
  if (!cached) {
    const make = (r: number, g: number, b: number) => {
      const canvas = newCanvas(mask.width, mask.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const image = ctx.createImageData(mask.width, mask.height);
        for (let i = 0; i < mask.alpha.length; i++) {
          image.data[i * 4] = r;
          image.data[i * 4 + 1] = g;
          image.data[i * 4 + 2] = b;
          image.data[i * 4 + 3] = mask.alpha[i];
        }
        ctx.putImageData(image, 0, 0);
      }
      return canvas;
    };
    cached = { white: make(255, 255, 255), green: make(74, 222, 128) };
    maskCanvases.set(mask, cached);
  }
  return cached;
}

const contours = new WeakMap<SilhouetteMask, Polyline[]>();

function contourOf(mask: SilhouetteMask): Polyline[] {
  let lines = contours.get(mask);
  if (!lines) {
    lines = maskContour(mask);
    contours.set(mask, lines);
  }
  return lines;
}

const figures = new WeakMap<PosePoints, Map<string, SilhouetteMask>>();

/** The volumetric figure for a template in a box, rasterised once per box and image shape. */
function figureFor(points: PosePoints, box: Box, aspect: number): SilhouetteMask {
  let byBox = figures.get(points);
  if (!byBox) {
    byBox = new Map();
    figures.set(points, byBox);
  }
  const key = [box.x, box.y, box.w, box.h, aspect].map((n) => n.toFixed(3)).join(",");
  let mask = byBox.get(key);
  if (!mask) {
    mask = figureMask(points, box, aspect);
    if (byBox.size > 8) byBox.clear();
    byBox.set(key, mask);
  }
  return mask;
}

/* ----------------------------------------------------------------- drawing */

export function drawGuides(ctx: CanvasRenderingContext2D, frame: GuideFrame): void {
  const { map } = frame;
  ctx.clearRect(0, 0, map.viewW, map.viewH);
  if (frame.minimal) {
    drawMinimalGuide(ctx, frame);
    return;
  }
  const score = frame.score ?? 0;
  const matched = frame.matched ?? score >= MATCH_SCORE;
  const t = greenness(score, matched);
  const aspect = map.imgW / Math.max(1, map.imgH);

  const target =
    frame.targetSilhouette ?? (frame.ghost && frame.targetBox ? figureFor(frame.ghost, frame.targetBox, aspect) : undefined);
  const move = frame.ghostBox && frame.targetBox ? moveBetween(frame.targetBox, frame.ghostBox) : SAME_PLACE;
  if (target) drawTarget(ctx, target, map, t, matched, move);
  if (frame.targetBox) drawTargetBox(ctx, frame.targetBox, map, t);
  if (frame.silhouette) drawLiveOutline(ctx, frame.silhouette, map, t);
  if (frame.live) drawLiveSkeleton(ctx, frame.live, map, matched, frame.highlight ?? []);
  if (typeof frame.levelErrorDeg === "number") drawLevel(ctx, frame.levelErrorDeg, map);
}

const LIMB_POINTS: Record<Limb, PosePointName[]> = {
  leftArm: ["lElbow", "lWrist"], rightArm: ["rElbow", "rWrist"],
  leftLeg: ["lKnee", "lAnkle"], rightLeg: ["rKnee", "rAnkle"],
  torso: ["lShoulder", "rShoulder"], head: ["nose"],
};

/** One arrow, attached to the visible joint with the largest useful correction. */
export function movementArrow(frame: GuideFrame): { from: Point2; to: Point2 } | null {
  const box = frame.ghostBox ?? frame.targetBox;
  if (!frame.ghost || !box || !frame.live || frame.matched) return null;
  const target = placeTemplate(frame.ghost, box, frame.map);
  let result: { from: Point2; to: Point2 } | null = null;
  let largest = 14;
  for (const limb of frame.highlight ?? []) {
    for (const key of LIMB_POINTS[limb]) {
      const live = frame.live[key];
      if (!live) continue;
      const from: Point2 = [frame.map.x(live[0]), frame.map.y(live[1])];
      const to = target[key];
      if ([from, to].some(([x, y]) => x < 0 || y < 0 || x > frame.map.viewW || y > frame.map.viewH)) continue;
      const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (distance > largest) { largest = distance; result = { from, to }; }
    }
  }
  return result;
}

function drawMinimalGuide(ctx: CanvasRenderingContext2D, frame: GuideFrame): void {
  // Never show a fabricated person floating over an empty scene.
  if (!frame.live || !frame.ghost || !frame.targetBox || !frame.ghostBox) return;
  const { map } = frame;
  const target = figureFor(frame.ghost, frame.targetBox, map.imgW / map.imgH);
  const move = moveBetween(frame.targetBox, frame.ghostBox);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 4;
  ctx.strokeStyle = frame.matched ? "#bbf7c0" : "rgba(255,255,255,.8)";
  ctx.lineWidth = 1.8;
  ctx.setLineDash(frame.matched ? [] : [5, 6]);
  traceMask(ctx, target, map, move);
  ctx.stroke();
  ctx.setLineDash([]);
  const arrow = movementArrow(frame);
  if (arrow) {
    const { from, to } = arrow;
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    ctx.strokeStyle = "#f7db7c";
    ctx.fillStyle = "#f7db7c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(from[0], from[1], 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.moveTo(to[0] - 10 * Math.cos(angle - .5), to[1] - 10 * Math.sin(angle - .5));
    ctx.lineTo(to[0], to[1]);
    ctx.lineTo(to[0] - 10 * Math.cos(angle + .5), to[1] - 10 * Math.sin(angle + .5));
    ctx.stroke();
  }
  ctx.restore();
}

/** Moves normalised image points: identity, or from one box onto another. */
type Move = (x: number, y: number) => Point2;
const SAME_PLACE: Move = (x, y) => [x, y];

/** Puts what sits in `from` onto `to`: same horizontal centre and top, scaled by the heights (evenly in both axes). */
function moveBetween(from: Box, to: Box): Move {
  const s = to.h / Math.max(1e-6, from.h);
  const ax = from.x + from.w / 2;
  const gx = to.x + to.w / 2;
  return (x, y) => [gx + (x - ax) * s, to.y + (y - from.y) * s];
}

/** Paints an image that covers the whole camera picture, moved like the target shape. */
function drawOverPicture(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, map: ViewMap, move: Move = SAME_PLACE): void {
  const [x0, y0] = move(0, 0);
  const [x1, y1] = move(1, 1);
  ctx.drawImage(image, map.x(x0), map.y(y0), (x1 - x0) * map.imgW * map.scale, (y1 - y0) * map.imgH * map.scale);
}

function drawTarget(ctx: CanvasRenderingContext2D, mask: SilhouetteMask, map: ViewMap, t: number, matched: boolean, move: Move): void {
  const fills = maskFills(mask);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = matched ? 0.24 : 0.16;
  drawOverPicture(ctx, matched ? fills.green : fills.white, map, move);
  ctx.globalAlpha = 1;
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = guideColour(t, 0.95);
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 4;
  traceMask(ctx, mask, map, move);
  ctx.stroke();
  ctx.restore();
}

/** Strokes every outline of a mask as one path, mapped onto the view. */
function traceMask(ctx: CanvasRenderingContext2D, mask: SilhouetteMask, map: ViewMap, move: Move = SAME_PLACE): void {
  ctx.beginPath();
  for (const line of contourOf(mask)) {
    for (let i = 0; i < line.length; i += 2) {
      const [x, y] = move(line[i], line[i + 1]);
      if (i === 0) ctx.moveTo(map.x(x), map.y(y));
      else ctx.lineTo(map.x(x), map.y(y));
    }
  }
}

function drawLiveOutline(ctx: CanvasRenderingContext2D, mask: SilhouetteMask, map: ViewMap, t: number): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // A faint dark edge first, so the outline also reads on light backgrounds.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 6;
  traceMask(ctx, mask, map);
  ctx.stroke();
  // Then the glowing line itself.
  ctx.strokeStyle = liveColour(t, 0.95);
  ctx.shadowColor = liveColour(t, 0.9);
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.75;
  traceMask(ctx, mask, map);
  ctx.stroke();
  ctx.restore();
}

function drawTargetBox(ctx: CanvasRenderingContext2D, box: Box, map: ViewMap, t: number): void {
  const x = map.x(box.x);
  const y = map.y(box.y);
  const w = box.w * map.imgW * map.scale;
  const h = box.h * map.imgH * map.scale;
  const arm = Math.min(w, h) * 0.12;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.strokeStyle = guideColour(t, 0.7);
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

function drawLiveSkeleton(
  ctx: CanvasRenderingContext2D,
  live: Partial<Record<PosePointName, Point2>>,
  map: ViewMap,
  matched: boolean,
  highlight: Limb[],
): void {
  const flagged = new Set(highlight);
  const px = (name: PosePointName): Point2 | null => {
    const p = live[name];
    return p ? [map.x(p[0]), map.y(p[1])] : null;
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 3;
  for (const [a, b] of BONES) {
    const p = px(a);
    const q = px(b);
    if (!p || !q) continue;
    const limb = boneLimb(a, b);
    const isFlagged = !matched && flagged.has(limb);
    ctx.strokeStyle = matched ? GREEN : isFlagged ? RED : WHITE;
    ctx.lineWidth = isFlagged ? 5 : 3.5;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }
  // Joints.
  ctx.fillStyle = matched ? GREEN : WHITE;
  for (const name of Object.keys(live) as PosePointName[]) {
    if (name === "nose") continue;
    const p = px(name);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The head, only when the coach is asking about it.
  const nose = px("nose");
  if (nose && !matched && flagged.has("head")) {
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(nose[0], nose[1], 18, 0, Math.PI * 2);
    ctx.stroke();
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
