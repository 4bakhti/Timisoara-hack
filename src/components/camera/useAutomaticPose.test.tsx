// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { grabFrame } from "@/vision/frame";
import { sceneChanged, useAutomaticPose } from "./useAutomaticPose";
vi.mock("@/vision/frame", () => ({ grabFrame: vi.fn() }));
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(1024) }) } as unknown as CanvasRenderingContext2D);
  vi.mocked(grabFrame).mockResolvedValue({ dataUrl: "data:image/jpeg;base64,AAAA", blob: new Blob(), width: 500, height: 500 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("starts automatically and ignores an aborted response after switching source", async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; })).mockResolvedValue(Response.json({ idea: null }));
  vi.stubGlobal("fetch", fetcher);
  const first = document.createElement("video");
  const second = document.createElement("video");
  const { result, rerender } = renderHook(({ source }) => useAutomaticPose(source, true), { initialProps: { source: first } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  rerender({ source: second });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json({ idea: SAMPLE_PLAN_PERSON.ideas[0] })));
  expect(result.current.idea).toBeNull();
});
it("never uploads frames when guidance is off", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  renderHook(() => useAutomaticPose(document.createElement("video"), false));
  expect(fetcher).not.toHaveBeenCalled();
});
it("marks provider errors instead of inventing a successful pose", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  const source = document.createElement("video");
  const { result } = renderHook(() => useAutomaticPose(source, true));
  await waitFor(() => expect(result.current.unavailable).toBe(true));
  expect(result.current.idea).toBeNull();
  expect(result.current.pending).toBe(false);
});
it("keeps a pose steady through small changes but recognizes a new scene", () => {
  const a = new Uint8ClampedArray(16).fill(100);
  expect(sceneChanged(a, new Uint8ClampedArray(16).fill(110))).toBe(false);
  expect(sceneChanged(a, new Uint8ClampedArray(16).fill(200))).toBe(true);
});
