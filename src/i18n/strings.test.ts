import { describe, expect, it } from "vitest";
import { qrPath } from "@/components/QrCode";
import { isLocalOnly } from "@/components/ShareLink";
import { formatNumber, STRINGS, tf } from "@/i18n/strings";
import { distanceMeters, formatCoords, formatDistance } from "@/state/position";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("interface text", () => {
  it("exists in both languages for every key, with the same placeholders", () => {
    for (const [key, text] of Object.entries(STRINGS)) {
      expect(text.en.trim(), `${key}.en`).not.toBe("");
      expect(text.ro.trim(), `${key}.ro`).not.toBe("");
      expect(placeholders(text.ro), `${key} placeholders`).toEqual(placeholders(text.en));
    }
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(tf("ofTotal", "en", { a: 9, b: 12 })).toBe("9 of 12");
    expect(tf("ofTotal", "ro", { a: 9, b: 12 })).toBe("9 din 12");
    expect(tf("ofTotal", "en", { a: 9 })).toBe("9 of {b}");
  });

  it("formats numbers per language", () => {
    expect(formatNumber(41.52, "en")).toBe("41.5");
    expect(formatNumber(41.52, "ro")).toBe("41,5");
  });
});

describe("position helpers", () => {
  it("measures distance on the ground", () => {
    const unirii = { lat: 45.7579, lng: 21.229 };
    const victoriei = { lat: 45.7537, lng: 21.2257 };
    const meters = distanceMeters(unirii, victoriei);
    expect(meters).toBeGreaterThan(450);
    expect(meters).toBeLessThan(600);
    expect(distanceMeters(unirii, unirii)).toBe(0);
  });

  it("writes distances and coordinates for people", () => {
    expect(formatDistance(347, "en")).toBe("350 m");
    expect(formatDistance(2360, "en")).toBe("2.4 km");
    expect(formatDistance(2360, "ro")).toBe("2,4 km");
    expect(formatCoords({ lat: 45.7575, lng: 21.2299 })).toBe("45.7575, 21.2299");
  });
});

describe("share links", () => {
  it("draws a QR code with a quiet zone, and gives up cleanly on text that is too long", () => {
    const drawn = qrPath("https://example.test/r/abc123");
    expect(drawn).not.toBeNull();
    // QR sizes are 21, 25, 29… modules, plus four blank modules on each side.
    expect((drawn!.side - 8 - 21) % 4).toBe(0);
    // The top-left finder pattern starts right after the quiet zone.
    expect(drawn!.path.startsWith("M4,4h1v1h-1z")).toBe(true);
    expect(qrPath("x".repeat(5000))).toBeNull();
  });

  it("knows which addresses only work on this device", () => {
    expect(isLocalOnly("http://localhost:3000/r/abc")).toBe(true);
    expect(isLocalOnly("http://127.0.0.1:3000/r/abc")).toBe(true);
    expect(isLocalOnly("https://framewise.example/r/abc")).toBe(false);
    expect(isLocalOnly("not a url")).toBe(false);
  });
});
