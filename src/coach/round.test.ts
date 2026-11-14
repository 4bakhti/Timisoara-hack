import { afterEach, describe, expect, it } from "vitest";
import { currentRound } from "./engineShared";

const g = globalThis as { window?: unknown };

afterEach(() => {
  delete g.window;
});

describe("currentRound", () => {
  it("is undefined outside a browser", () => {
    expect(currentRound()).toBeUndefined();
  });

  it("reads a valid round label from the address and ignores anything else", () => {
    g.window = { location: { href: "https://example.test/shoot?round=round-1" } };
    expect(currentRound()).toBe("round-1");
    g.window = { location: { href: "https://example.test/shoot?round=<script>" } };
    expect(currentRound()).toBeUndefined();
    g.window = { location: { href: "https://example.test/shoot" } };
    expect(currentRound()).toBeUndefined();
  });
});
