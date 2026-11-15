// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedShot, CoachSessionOptions } from "@/coach";
import { PoseCamera } from "@/components/PoseCamera";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";

/** The coach is replaced by a stand-in that records what it was given and captures on demand. */
const coach = vi.hoisted(() => ({ options: null as CoachSessionOptions | null }));

vi.mock("@/coach", () => ({
  unlockAudio: vi.fn(),
  useCoachSession: (options: CoachSessionOptions) => {
    coach.options = options;
    const shot: CapturedShot = {
      blob: new Blob(["photo"], { type: "image/jpeg" }),
      dataUrl: "data:image/jpeg;base64,UEhPVE8=",
      width: 3,
      height: 4,
      score: { total: 80, framing: 90, level: null, pose: 75, crop: null, light: null },
      manual: true,
    };
    return {
      phase: "coaching" as const,
      score: 40,
      parts: { pose: null, framing: null, level: null },
      instruction: { id: "lower_left_arm", text: "Lower your left arm a little.", to: "subject" },
      countdown: null,
      personVisible: true,
      fps: 20,
      simulated: false,
      error: null,
      captureNow: () => options.onCapture(shot),
      requestCapture: async () => ({ ok: true as const, outcome: "captured" as const }),
      cancelPendingCapture: () => undefined,
      restart: () => undefined,
    };
  },
}));

vi.mock("@/vision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/vision")>();
  return { ...actual, grabFrame: vi.fn(async () => ({ dataUrl: "data:image/jpeg;base64,RlJBTUU=", width: 4, height: 3 })) };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, pose: vi.fn() } };
});

const getUserMedia = vi.fn();
const posing = () => coach.options?.idea.subject?.poseTemplateId;

beforeEach(() => {
  coach.options = null;
  vi.mocked(api.pose).mockReset();
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { get: () => 640, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PoseCamera", () => {
  it("opens the camera at once and shows no text, only the camera, the pose and icons", async () => {
    vi.mocked(api.pose).mockResolvedValue(null);
    const { container } = render(<PoseCamera />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia.mock.calls[0][0].video.facingMode).toEqual({ ideal: "environment" });
    await waitFor(() => expect(coach.options?.video).toBeTruthy());
    expect(screen.getByRole("button", { name: t("cameraShutter", "en") })).toBeTruthy();
    expect(screen.getAllByRole("radio").length).toBeGreaterThanOrEqual(4);
    // The coach has an instruction, but nothing is written on screen.
    expect(container.textContent?.trim()).toBe("");
    expect(coach.options?.voice).toBe(false);
  });

  it("puts the poses the AI picked for this photo first", async () => {
    vi.mocked(api.pose).mockResolvedValue(["sit-relaxed", "thinker"]);
    render(<PoseCamera />);
    await waitFor(() => expect(api.pose).toHaveBeenCalledWith("data:image/jpeg;base64,RlJBTUU="), { timeout: 3000 });
    await waitFor(() => expect(posing()).toBe("sit-relaxed"));
    const radios = screen.getAllByRole("radio");
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios.length).toBeGreaterThan(2);
  });

  it("keeps the device's own poses when the AI cannot answer", async () => {
    vi.mocked(api.pose).mockResolvedValue(null);
    render(<PoseCamera />);
    await waitFor(() => expect(api.pose).toHaveBeenCalled(), { timeout: 3000 });
    expect(posing()).toBe("relaxed-stand");
  });

  it("changes the pose with a swipe or a tap on its figure", async () => {
    vi.mocked(api.pose).mockResolvedValue(null);
    render(<PoseCamera />);
    await waitFor(() => expect(coach.options?.video).toBeTruthy());
    const main = screen.getByRole("main");
    fireEvent.pointerDown(main, { clientX: 300 });
    fireEvent.pointerUp(main, { clientX: 120 });
    expect(posing()).toBe("hand-on-hip");
    fireEvent.click(screen.getAllByRole("radio")[2]);
    expect(posing()).toBe("three-quarter");
  });

  it("takes a photo with the shutter, shows it in the corner, and opens it", async () => {
    vi.mocked(api.pose).mockResolvedValue(null);
    render(<PoseCamera />);
    await waitFor(() => expect(coach.options?.video).toBeTruthy());
    const thumb = screen.getByRole("button", { name: t("cameraLastPhoto", "en") });
    expect((thumb as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: t("cameraShutter", "en") }));
    await waitFor(() => expect((thumb as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(thumb);
    expect(screen.getByRole("button", { name: t("cameraShare", "en") })).toBeTruthy();
    expect(coach.options?.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: t("cameraClose", "en") }));
    expect(coach.options?.paused).toBe(false);
  });
});
