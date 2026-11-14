/**
 * Silhouettes: shrinking the tracker's person mask, tracing outlines, and
 * drawing a volumetric body figure for template poses.
 *
 * Everything here is pure (no browser APIs), so it is unit-tested and cheap:
 * masks are small (about 160 px on the long side) and outlines are traced once
 * per mask, then reused.
 */
import type { Box, PosePointName, PosePoints } from "@/lib/contracts";
import type { SilhouetteMask } from "./types";

/** Long side of the masks kept for drawing. */
export const MASK_MAX_SIDE = 160;

/**
 * Shrinks a single-channel mask with a box filter so its long side is at most
 * `maxSide`. `scale` turns the input range into 0–255 (255 for 0–1 floats).
 */
export function downscaleMask(
  data: ArrayLike<number>,
  width: number,
  height: number,
  maxSide = MASK_MAX_SIDE,
  scale = 255,
): SilhouetteMask {
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * ratio));
  const outH = Math.max(1, Math.round(height * ratio));
  const alpha = new Uint8ClampedArray(outW * outH);
  const stepX = width / outW;
  const stepY = height / outH;
  for (let oy = 0; oy < outH; oy++) {
    const y0 = Math.floor(oy * stepY);
    const y1 = Math.max(y0 + 1, Math.floor((oy + 1) * stepY));
    for (let ox = 0; ox < outW; ox++) {
      const x0 = Math.floor(ox * stepX);
      const x1 = Math.max(x0 + 1, Math.floor((ox + 1) * stepX));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        const row = y * width;
        for (let x = x0; x < x1 && x < width; x++) {
          sum += data[row + x];
          count += 1;
        }
      }
      alpha[oy * outW + ox] = count ? (sum / count) * scale : 0;
    }
  }
  return { width: outW, height: outH, alpha };
}

/** Share of the mask that is "person" (alpha ≥ 128). */
export function maskCoverage(mask: SilhouetteMask): number {
  let inside = 0;
  for (let i = 0; i < mask.alpha.length; i++) if (mask.alpha[i] >= 128) inside += 1;
  return mask.alpha.length ? inside / mask.alpha.length : 0;
}

/* ------------------------------------------------------------- outlines */

/** An outline as a list of points [x0, y0, x1, y1, …] in normalised image coordinates (0–1). */
export type Polyline = number[];

/**
 * Traces the outline of a mask with marching squares and joins the pieces into
 * polylines, so a dashed stroke flows smoothly along the edge.
 */
export function maskContour(mask: SilhouetteMask, threshold = 128): Polyline[] {
  const { width: w, height: h, alpha } = mask;
  if (w < 2 || h < 2) return [];
  const value = (x: number, y: number) => alpha[y * w + x];
  // Sample positions are pixel centres, in normalised coordinates.
  const nx = (x: number) => (x + 0.5) / w;
  const ny = (y: number) => (y + 0.5) / h;
  const lerp = (a: number, b: number) => (a === b ? 0.5 : Math.min(1, Math.max(0, (threshold - a) / (b - a))));

  const segments: number[] = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = value(x, y);
      const tr = value(x + 1, y);
      const br = value(x + 1, y + 1);
      const bl = value(x, y + 1);
      const index = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0) | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
      if (index === 0 || index === 15) continue;
      // Edge crossing points.
      const top = (): [number, number] => [nx(x + lerp(tl, tr)), ny(y)];
      const right = (): [number, number] => [nx(x + 1), ny(y + lerp(tr, br))];
      const bottom = (): [number, number] => [nx(x + lerp(bl, br)), ny(y + 1)];
      const left = (): [number, number] => [nx(x), ny(y + lerp(tl, bl))];
      const add = (a: [number, number], b: [number, number]) => segments.push(a[0], a[1], b[0], b[1]);
      switch (index) {
        case 1: case 14: add(left(), bottom()); break;
        case 2: case 13: add(bottom(), right()); break;
        case 3: case 12: add(left(), right()); break;
        case 4: case 11: add(top(), right()); break;
        case 6: case 9: add(top(), bottom()); break;
        case 7: case 8: add(left(), top()); break;
        case 5: add(left(), top()); add(bottom(), right()); break;
        case 10: add(top(), right()); add(left(), bottom()); break;
      }
    }
  }
  return chainSegments(segments);
}

/** Joins loose segments [x1, y1, x2, y2, …] that share end points into polylines. */
export function chainSegments(segments: number[]): Polyline[] {
  const count = segments.length / 4;
  const key = (x: number, y: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
  const byPoint = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    for (const end of [0, 1]) {
      const k = key(segments[i * 4 + end * 2], segments[i * 4 + end * 2 + 1]);
      const list = byPoint.get(k);
      if (list) list.push(i);
      else byPoint.set(k, [i]);
    }
  }
  const used = new Uint8Array(count);
  const lines: Polyline[] = [];
  const point = (i: number, end: number): [number, number] => [segments[i * 4 + end * 2], segments[i * 4 + end * 2 + 1]];

  for (let start = 0; start < count; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const line: number[] = [...point(start, 0), ...point(start, 1)];
    // Extend forward from the tail, then backward from the head.
    for (const forward of [true, false]) {
      for (;;) {
        const [px, py] = forward ? [line[line.length - 2], line[line.length - 1]] : [line[0], line[1]];
        const next = (byPoint.get(key(px, py)) ?? []).find((i) => !used[i]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = [point(next, 0), point(next, 1)];
        const matchesA = key(a[0], a[1]) === key(px, py);
        const other = matchesA ? b : a;
        if (forward) line.push(other[0], other[1]);
        else line.unshift(other[0], other[1]);
      }
    }
    if (line.length >= 6) lines.push(line);
  }
  return lines;
}

/* ------------------------------------------------- volumetric body figure */

/** Limb radii as a share of the figure's height: [start, end]. */
const LIMBS: ReadonlyArray<readonly [PosePointName, PosePointName, number, number]> = [
  ["lShoulder", "lElbow", 0.046, 0.034],
  ["rShoulder", "rElbow", 0.046, 0.034],
  ["lElbow", "lWrist", 0.033, 0.024],
  ["rElbow", "rWrist", 0.033, 0.024],
  ["lHip", "lKnee", 0.062, 0.043],
  ["rHip", "rKnee", 0.062, 0.043],
  ["lKnee", "lAnkle", 0.042, 0.029],
  ["rKnee", "rAnkle", 0.042, 0.029],
];

/**
 * Rasterises a body-shaped figure for a pose: tapered limbs, a torso and a head,
 * placed in `box` like the template ghost. Returns a mask covering the whole
 * image (normalised coordinates), at most `maxSide` px on the long side.
 */
export function figureMask(points: PosePoints, box: Box, aspect: number, maxSide = 128): SilhouetteMask {
  const w = aspect >= 1 ? maxSide : Math.max(2, Math.round(maxSide * aspect));
  const h = aspect >= 1 ? Math.max(2, Math.round(maxSide / aspect)) : maxSide;
  const alpha = new Uint8ClampedArray(w * h);

  // Template points (unit box, figure fills the height) → mask pixels. Mask pixels are
  // square because w / h equals the image aspect.
  const figureH = box.h * h;
  const centreX = (box.x + box.w / 2) * w;
  const top = box.y * h;
  const px = (name: PosePointName): [number, number] => [centreX + (points[name][0] - 0.5) * figureH, top + points[name][1] * figureH];

  const capsules = LIMBS.map(([a, b, r0, r1]) => ({ a: px(a), b: px(b), r0: r0 * figureH, r1: r1 * figureH }));
  const lS = px("lShoulder");
  const rS = px("rShoulder");
  const lH = px("lHip");
  const rH = px("rHip");
  const widen = (p: [number, number], q: [number, number], amount: number): [number, number] => {
    const dx = p[0] - q[0];
    const dy = p[1] - q[1];
    const len = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / len) * amount, p[1] + (dy / len) * amount];
  };
  // Torso: shoulders and hips pushed outward a little so the body has width.
  const torso: [number, number][] = [
    widen(lS, rS, 0.035 * figureH),
    widen(lH, rH, 0.03 * figureH),
    widen(rH, lH, 0.03 * figureH),
    widen(rS, lS, 0.035 * figureH),
  ];
  const shoulderMid: [number, number] = [(lS[0] + rS[0]) / 2, (lS[1] + rS[1]) / 2];
  const nose = px("nose");
  const neck = { a: shoulderMid, b: nose, r0: 0.03 * figureH, r1: 0.026 * figureH };
  const headR = Math.max(1.5, (shoulderMid[1] - nose[1]) * 0.5);

  // Only scan around the figure.
  const pad = 0.12 * figureH;
  const xs = [...Object.values(points).map((p) => centreX + (p[0] - 0.5) * figureH)];
  const ys = [...Object.values(points).map((p) => top + p[1] * figureH)];
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - headR - pad));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys) + pad));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p: [number, number] = [x + 0.5, y + 0.5];
      // Signed distance-like coverage: positive inside; soft 1-px edge.
      let best = -Infinity;
      for (const c of capsules) best = Math.max(best, capsuleInside(p, c));
      best = Math.max(best, capsuleInside(p, neck));
      best = Math.max(best, headR - Math.hypot(p[0] - nose[0], p[1] - nose[1]));
      if (best < 0.5 && pointInPolygon(p, torso)) best = 1;
      if (best > -0.5) alpha[y * w + x] = Math.min(255, Math.round((best + 0.5) * 255));
    }
  }
  return { width: w, height: h, alpha };
}

/** How far inside a tapered capsule a point is (pixels; negative = outside). */
function capsuleInside(p: [number, number], c: { a: [number, number]; b: [number, number]; r0: number; r1: number }): number {
  const dx = c.b[0] - c.a[0];
  const dy = c.b[1] - c.a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((p[0] - c.a[0]) * dx + (p[1] - c.a[1]) * dy) / len2));
  const cx = c.a[0] + t * dx;
  const cy = c.a[1] + t * dy;
  const r = c.r0 + (c.r1 - c.r0) * t;
  return r - Math.hypot(p[0] - cx, p[1] - cy);
}

function pointInPolygon(p: [number, number], poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
