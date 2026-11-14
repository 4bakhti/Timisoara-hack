// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_PLAN_OBJECT, SAMPLE_PLAN_PERSON } from "@/lib/fixtures";

const health = vi.fn();
const preview = vi.fn();
vi.mock("@/lib/api", () => ({ api: { health: () => health(), preview: (req: unknown) => preview(req) } }));

const { usePosePreviews } = await import("./usePosePreviews");

const ON = { gemini: true, voice: false, db: false, auth: false, preview: true, stamp: false };
const OFF = { ...ON, preview: false };
const IMAGE = "data:image/jpeg;base64,AAAA";

beforeEach(() => {
  health.mockReset();
  preview.mockReset();
});

describe("usePosePreviews", () => {
  it("asks for nothing when the server cannot make previews", async () => {
    health.mockResolvedValue(OFF);
    const { result } = renderHook(() => usePosePreviews());
    await act(() => result.current.request(IMAGE, SAMPLE_PLAN_PERSON.ideas, "en"));
    expect(preview).not.toHaveBeenCalled();
    expect(result.current.previews).toEqual({});
  });

  it("shows loading, then each preview or a failure", async () => {
    health.mockResolvedValue(ON);
    const [a, b, c] = SAMPLE_PLAN_PERSON.ideas;
    preview.mockImplementation(async ({ idea }: { idea: { id: string } }) =>
      idea.id === b.id ? null : { image: `data:image/png;base64,${idea.id}` },
    );
    const { result } = renderHook(() => usePosePreviews());
    await act(() => result.current.request(IMAGE, SAMPLE_PLAN_PERSON.ideas, "en"));
    await waitFor(() => expect(result.current.previews[c.id]?.status).toBe("ready"));
    expect(result.current.previews[a.id]).toEqual({ status: "ready", image: `data:image/png;base64,${a.id}` });
    expect(result.current.previews[b.id]).toEqual({ status: "failed" });
    expect(preview).toHaveBeenCalledTimes(3);
  });

  it("skips ideas without a person", async () => {
    health.mockResolvedValue(ON);
    const { result } = renderHook(() => usePosePreviews());
    await act(() => result.current.request(IMAGE, SAMPLE_PLAN_OBJECT.ideas, "en"));
    expect(health).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });

  it("drops answers that arrive after a newer scene was read", async () => {
    health.mockResolvedValue(ON);
    let release: (value: unknown) => void = () => undefined;
    preview.mockImplementationOnce(() => new Promise((resolve) => (release = resolve))).mockResolvedValue(null);
    const { result } = renderHook(() => usePosePreviews());
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.request(IMAGE, [SAMPLE_PLAN_PERSON.ideas[0]], "en");
    });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    act(() => result.current.clear());
    await act(async () => {
      release({ image: "data:image/png;base64,old" });
      await first;
    });
    expect(result.current.previews).toEqual({});
  });
});
