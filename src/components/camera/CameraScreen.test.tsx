// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CameraScreen } from "./CameraScreen";
import { grabFrame } from "@/vision/frame";

vi.mock("./useAutomaticPose", () => ({ useAutomaticPose: () => ({ idea: null, pending: false, unavailable: false }) }));
vi.mock("@/vision/frame", () => ({ grabFrame: vi.fn() }));
vi.mock("@/coach", () => ({ useCoachSession: vi.fn(), unlockAudio: vi.fn() }));
vi.mock("@/coach/voice", () => ({ setMuted: vi.fn(), speakInstruction: vi.fn(), stopSpeaking: vi.fn() }));
const stop = vi.fn();
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  stop.mockClear();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 960 });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ clearRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => "blob:test-photo"); URL.revokeObjectURL = vi.fn();
  vi.mocked(grabFrame).mockResolvedValue({ blob: new Blob(["photo"], { type: "image/jpeg" }), dataUrl: "data:image/jpeg;base64,AAAA", width: 1280, height: 960 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("opens straight into a camera with no choices, analysis button or copy", async () => {
  const { container } = render(<CameraScreen />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Take photo" }) as HTMLButtonElement).disabled).toBe(false));
  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
  expect(container.textContent).toBe("");
  expect(screen.queryByRole("button", { name: /analy|read my|choose.*idea/i })).toBeNull();
});
it("captures without waiting for AI and opens a minimal preview from the thumbnail", async () => {
  render(<CameraScreen />);
  const shutter = screen.getByRole("button", { name: "Take photo" });
  await waitFor(() => expect((shutter as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(shutter);
  await screen.findByRole("button", { name: "Open last photo" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open last photo" }));
  expect(screen.getByRole("dialog", { name: "Captured photo" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Download photo" }).getAttribute("href")).toBe("blob:test-photo");
  expect(stop).toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("stops a late camera stream when the page was already closed", async () => {
  let resolve!: (value: MediaStream) => void;
  getUserMedia.mockImplementation(() => new Promise<MediaStream>(r => { resolve = r; }));
  const { unmount } = render(<CameraScreen />);
  unmount();
  await act(async () => resolve(stream));
  expect(stop).toHaveBeenCalledTimes(1);
});
it("releases the previous camera before switching to a mirrored front camera", async () => {
  const { container } = render(<CameraScreen />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Take photo" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  expect(stop).toHaveBeenCalled();
  expect(getUserMedia.mock.calls[1][0].video.facingMode.ideal).toBe("user");
  expect(container.querySelector("video")!.style.transform).toBe("scaleX(-1)");
});
it("provides a retry and photo fallback if permission is denied", async () => {
  getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  render(<CameraScreen />);
  await screen.findByText(/Allow camera access/);
  expect(screen.getByRole("button", { name: "Retry camera" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open a photo" })).toBeTruthy();
});
