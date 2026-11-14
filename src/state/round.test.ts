import { describe, expect, it } from "vitest";
import { roundLabel } from "./round";

describe("roundLabel", () => {
  it("accepts short labels of letters, digits and dashes", () => {
    expect(roundLabel("round-1")).toBe("round-1");
    expect(roundLabel("R2")).toBe("R2");
    expect(roundLabel("a".repeat(20))).toBe("a".repeat(20));
    expect(roundLabel(["round-2", "round-3"])).toBe("round-2");
  });

  it("ignores anything else", () => {
    expect(roundLabel(undefined)).toBeUndefined();
    expect(roundLabel("")).toBeUndefined();
    expect(roundLabel("a".repeat(21))).toBeUndefined();
    expect(roundLabel("round 1")).toBeUndefined();
    expect(roundLabel("round_1")).toBeUndefined();
    expect(roundLabel("<script>")).toBeUndefined();
    expect(roundLabel("rundă-1")).toBeUndefined();
  });
});
