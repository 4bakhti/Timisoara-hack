import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("does not resume device speech when a pending voice request fails after muting", async () => {
  vi.resetModules();
  const speak = vi.fn();
  vi.stubGlobal("window", {
    speechSynthesis: { speak, cancel: vi.fn() },
    setTimeout: vi.fn(),
  });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  let finishRequest!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finishRequest = resolve; })));
  const voice = await import("@/coach/voice");
  voice.setMuted(false);
  void voice.sayText("Move your left hand", "en");
  voice.setMuted(true);
  finishRequest(new Response(null, { status: 503 }));
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  expect(speak).not.toHaveBeenCalled();
});
