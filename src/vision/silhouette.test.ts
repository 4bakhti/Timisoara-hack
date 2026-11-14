import { describe, expect, it } from "vitest";
import { getPoseTemplate } from "./poses/catalog";
import { chainSegments, downscaleMask, figureMask, maskContour, maskCoverage } from "./silhouette";
import type { SilhouetteMask } from "./types";

/** A w×h mask with a filled rectangle (inclusive pixel bounds). */
function rectMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number): SilhouetteMask {
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) alpha[y * w + x] = 255;
  return { width: w, height: h, alpha };
}

describe("downscaleMask", () => {
  it("averages blocks and keeps the aspect", () => {
    // 4×2 float mask: left half person, right half background.
    const data = [1, 1, 0, 0, 1, 1, 0, 0];
    const mask = downscaleMask(data, 4, 2, 2);
    expect(mask.width).toBe(2);
    expect(mask.height).toBe(1);
    expect(Array.from(mask.alpha)).toEqual([255, 0]);
  });

  it("does not enlarge small masks and accepts byte data", () => {
    const mask = downscaleMask([0, 128, 255, 64], 2, 2, 160, 1);
    expect([mask.width, mask.height]).toEqual([2, 2]);
    expect(Array.from(mask.alpha)).toEqual([0, 128, 255, 64]);
  });

  it("shrinks a large mask to the requested long side", () => {
    const w = 512;
    const h = 288;
    const data = new Float32Array(w * h).fill(1);
    const mask = downscaleMask(data, w, h);
    expect(mask.width).toBe(160);
    expect(mask.height).toBe(90);
    expect(maskCoverage(mask)).toBe(1);
  });
});

describe("maskContour", () => {
  it("traces a filled rectangle as one closed outline on its border", () => {
    const mask = rectMask(20, 20, 5, 5, 14, 14);
    const lines = maskContour(mask);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    // Closed: first and last points coincide.
    expect(line[0]).toBeCloseTo(line[line.length - 2], 5);
    expect(line[1]).toBeCloseTo(line[line.length - 1], 5);
    // Every point lies just outside the filled pixels, inside the next ring.
    for (let i = 0; i < line.length; i += 2) {
      const x = line[i] * 20 - 0.5;
      const y = line[i + 1] * 20 - 0.5;
      expect(x).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThanOrEqual(15);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(y).toBeLessThanOrEqual(15);
    }
  });

  it("returns nothing for an empty or full mask", () => {
    expect(maskContour(rectMask(10, 10, 0, 0, -1, -1))).toHaveLength(0);
    expect(maskContour(rectMask(10, 10, 0, 0, 9, 9))).toHaveLength(0);
  });

  it("finds two outlines for two separate shapes", () => {
    const mask = rectMask(30, 10, 2, 2, 6, 7);
    for (let y = 2; y <= 7; y++) for (let x = 20; x <= 26; x++) mask.alpha[y * 30 + x] = 255;
    expect(maskContour(mask)).toHaveLength(2);
  });
});

describe("chainSegments", () => {
  it("joins segments that share end points, in either direction", () => {
    const lines = chainSegments([0, 0, 1, 0, 2, 0, 1, 0, 2, 0, 3, 0]);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBe(8);
  });
});

describe("figureMask", () => {
  const box = { x: 0.3, y: 0.1, w: 0.4, h: 0.8 };

  it("fills the body and leaves the background empty", () => {
    const mask = figureMask(getPoseTemplate("relaxed-stand").points, box, 3 / 4);
    expect(mask.width).toBe(96);
    expect(mask.height).toBe(128);
    const at = (nx: number, ny: number) => mask.alpha[Math.floor(ny * mask.height) * mask.width + Math.floor(nx * mask.width)];
    // Torso centre is inside; image corners and far sides are outside.
    expect(at(0.5, 0.4)).toBe(255);
    expect(at(0.02, 0.02)).toBe(0);
    expect(at(0.1, 0.5)).toBe(0);
    expect(at(0.9, 0.5)).toBe(0);
    // A body covers a plausible share of its box: not a stick, not a block.
    const coverage = maskCoverage(mask) / (box.w * box.h);
    expect(coverage).toBeGreaterThan(0.15);
    expect(coverage).toBeLessThan(0.6);
  });

  it("follows the pose: raised arms reach above the head", () => {
    const up = figureMask(getPoseTemplate("arms-up").points, box, 3 / 4);
    const down = figureMask(getPoseTemplate("relaxed-stand").points, box, 3 / 4);
    const topRow = (m: SilhouetteMask) => {
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.alpha[y * m.width + x] >= 128) return y;
      return m.height;
    };
    // Both figures fill the box height, so compare where the head sits instead:
    // with arms up, the hands are the top, so the head starts lower.
    const headRow = (m: SilhouetteMask) => {
      const x = Math.floor(0.5 * m.width);
      for (let y = 0; y < m.height; y++) if (m.alpha[y * m.width + x] >= 128) return y;
      return m.height;
    };
    expect(topRow(up)).toBeLessThanOrEqual(topRow(down));
    expect(headRow(up)).toBeGreaterThan(headRow(down));
  });

  it("produces an outline that can be traced", () => {
    const mask = figureMask(getPoseTemplate("hand-on-hip").points, box, 3 / 4);
    const lines = maskContour(mask);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...lines.map((l) => l.length))).toBeGreaterThan(60);
  });
});
