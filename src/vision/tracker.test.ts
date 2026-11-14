import { describe, expect, it } from "vitest";
import { DOWNGRADE_ABOVE_MS, MIN_SAMPLES, UPGRADE_BELOW_MS, nextModel, personMaskIndex } from "./tracker";

const enough = MIN_SAMPLES;

describe("nextModel", () => {
  it("waits for enough timed frames before deciding", () => {
    expect(nextModel("lite", { samples: enough - 1, avgMs: 5, fullTooSlow: false })).toBe("lite");
    expect(nextModel("full", { samples: enough - 1, avgMs: 200, fullTooSlow: false })).toBe("full");
  });

  it("upgrades a fast phone from lite to full", () => {
    expect(nextModel("lite", { samples: enough, avgMs: UPGRADE_BELOW_MS, fullTooSlow: false })).toBe("full");
    expect(nextModel("lite", { samples: enough, avgMs: UPGRADE_BELOW_MS + 1, fullTooSlow: false })).toBe("lite");
  });

  it("never upgrades again once full proved too slow", () => {
    expect(nextModel("lite", { samples: enough, avgMs: 5, fullTooSlow: true })).toBe("lite");
  });

  it("drops a slow phone from full back to lite", () => {
    expect(nextModel("full", { samples: enough, avgMs: DOWNGRADE_ABOVE_MS + 1, fullTooSlow: false })).toBe("lite");
    expect(nextModel("full", { samples: enough, avgMs: DOWNGRADE_ABOVE_MS, fullTooSlow: false })).toBe("full");
  });

  it("leaves a gap between the two thresholds so it cannot flip back and forth", () => {
    expect(UPGRADE_BELOW_MS * 2).toBeLessThan(DOWNGRADE_ABOVE_MS + 1);
  });
});

describe("personMaskIndex", () => {
  it("uses the segmenter's own label when it has one", () => {
    expect(personMaskIndex(["background", "person"], 2)).toBe(1);
    expect(personMaskIndex(["person", "background"], 2)).toBe(0);
    expect(personMaskIndex(["Selfie"], 1)).toBe(0);
  });

  it("falls back to the second mask (background first) or the only one", () => {
    expect(personMaskIndex([], 2)).toBe(1);
    expect(personMaskIndex([], 1)).toBe(0);
  });
});
