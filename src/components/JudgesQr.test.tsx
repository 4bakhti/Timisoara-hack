// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeScreen } from "@/components/HomeScreen";
import { JudgesQr } from "@/components/JudgesQr";
import { t } from "@/i18n/strings";

afterEach(cleanup);

describe("JudgesQr", () => {
  it("points the QR code at /shoot on the address the page was opened from", () => {
    render(<JudgesQr lang="en" />);
    const qr = screen.getByRole("img", { name: t("scanQrAlt", "en") });
    expect(qr.getAttribute("data-qr-value")).toBe(`${window.location.origin}/shoot`);
    expect(screen.getByText(t("scanToTry", "en"))).toBeTruthy();
  });

  it("speaks Romanian", () => {
    render(<JudgesQr lang="ro" />);
    expect(screen.getByText(t("scanToTry", "ro"))).toBeTruthy();
  });

  it("sits on the home page and is kept out of the phone layout", () => {
    render(<HomeScreen />);
    const qr = screen.getByTestId("judges-qr");
    expect(qr.closest("aside")?.className).toContain("hidden");
    expect(qr.closest("aside")?.className).toContain("lg:block");
  });
});
