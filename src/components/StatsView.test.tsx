// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatsView } from "@/components/StatsView";
import { HEALTH_NO_DB, HEALTH_WITH_DB, TEST_STATS } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, health: vi.fn(), stats: vi.fn() } };
});

const stats = vi.mocked(api.stats);
const health = vi.mocked(api.health);
const state = (name: string) => document.querySelector(`[data-state="${name}"]`);

beforeEach(() => {
  stats.mockReset();
  health.mockReset();
  health.mockResolvedValue(HEALTH_WITH_DB);
});
afterEach(cleanup);

describe("StatsView", () => {
  it("shows no numbers at all when the service is unavailable, and can try again", async () => {
    stats.mockResolvedValueOnce(null).mockResolvedValueOnce(TEST_STATS);
    health.mockResolvedValue(HEALTH_NO_DB);
    render(<StatsView />);
    expect(await screen.findByText(t("statsUnavailable", "en"))).toBeTruthy();
    expect(state("unavailable")).not.toBeNull();
    // Not the empty state, not the temporary-storage note, and no version cards.
    expect(state("empty")).toBeNull();
    expect(state("temporary")).toBeNull();
    expect(screen.queryByText(t("sessions", "en"))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t("retry", "en") }));
    expect(await screen.findByText("Version 0.1.0")).toBeTruthy();
    expect(state("unavailable")).toBeNull();
  });

  it("tells an empty service apart from an unavailable one", async () => {
    stats.mockResolvedValue({ versions: [], votes: { total: 0, preferredAfter: 0 } });
    render(<StatsView />);
    expect(await screen.findByText(t("statsEmpty", "en"))).toBeTruthy();
    expect(state("empty")).not.toBeNull();
    expect(state("unavailable")).toBeNull();
    expect(state("temporary")).toBeNull();
  });

  it("flags temporary demo storage separately from the numbers", async () => {
    stats.mockResolvedValue(TEST_STATS);
    health.mockResolvedValue(HEALTH_NO_DB);
    render(<StatsView />);
    expect(await screen.findByText(t("statsTemp", "en"))).toBeTruthy();
    expect(state("temporary")).not.toBeNull();
    expect(screen.getByText("Version 0.1.0")).toBeTruthy();
  });

  it("shows the recorded numbers as they are", async () => {
    stats.mockResolvedValue(TEST_STATS);
    render(<StatsView />);
    const measured = within(await screen.findByRole("region", { name: "Version 0.1.0" }));
    expect(measured.getByText("12")).toBeTruthy();
    expect(measured.getByText("9 of 12")).toBeTruthy();
    expect(measured.getByText("41.5 s")).toBeTruthy();
    expect(measured.getByText("+17.3 points")).toBeTruthy();
    expect(measured.getByText("4.2 out of 5 (ratings: 5)")).toBeTruthy();
    expect(measured.getByText(t("thisBuild", "en"))).toBeTruthy();
    expect(state("temporary")).toBeNull();
  });

  it("shows unmeasured values as not measured, never as zero", async () => {
    stats.mockResolvedValue(TEST_STATS);
    render(<StatsView />);
    const unmeasured = within(await screen.findByRole("region", { name: "Version 0.0.9" }));
    expect(unmeasured.getAllByText(t("unmeasured", "en"))).toHaveLength(2);
    expect(unmeasured.getByText(t("noRatings", "en"))).toBeTruthy();
    expect(unmeasured.queryByText(/points/)).toBeNull();
    expect(unmeasured.queryByText(/out of 5/)).toBeNull();
    // Real counts stay real: three sessions, none ended with a photo.
    expect(unmeasured.getByText("0 of 3")).toBeTruthy();
  });

  it("keeps a real drop in score as a drop", async () => {
    stats.mockResolvedValue({
      versions: [{ appVersion: "0.2.0", sessions: 40, captured: 31, medianSecondsToMatch: 50, avgScoreGain: -3.5, avgRating: 3, ratings: 8 }],
      votes: { total: 10, preferredAfter: 4 },
    });
    render(<StatsView />);
    expect(await screen.findByText("−3.5 points")).toBeTruthy();
    expect(screen.getByText("4 of 10 votes preferred the photo taken after coaching.")).toBeTruthy();
    // Enough sessions: no small-numbers warning.
    expect(screen.queryByText(t("statsSmall", "en"))).toBeNull();
  });

  it("says when no blind votes exist instead of showing a share", async () => {
    stats.mockResolvedValue(TEST_STATS);
    render(<StatsView />);
    expect(await screen.findByText(t("votesNone", "en"))).toBeTruthy();
    expect(screen.queryByText(/preferred/)).toBeNull();
    expect(screen.getByText(t("statsSmall", "en"))).toBeTruthy();
    // The match score is never presented as a measure of quality.
    expect(screen.getByText(t("scoreCaveat", "en"))).toBeTruthy();
  });
});
