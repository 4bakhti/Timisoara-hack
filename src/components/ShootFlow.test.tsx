// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedShot, CoachSessionOptions } from "@/coach";
import { ShootFlow } from "@/components/ShootFlow";
import { HEALTH_NO_DB, TEST_RECIPE } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import { SAMPLE_PLAN_PERSON, sampleReview } from "@/lib/fixtures";
import { setLang } from "@/state/lang";

const BEFORE = "data:image/jpeg;base64,QkVGT1JF";
const AFTER = "data:image/jpeg;base64,QUZURVI=";

/** The coach is replaced by a stand-in that records what it was given and captures on demand. */
const coach = vi.hoisted(() => ({ options: null as CoachSessionOptions | null }));

vi.mock("@/coach", () => ({
  unlockAudio: vi.fn(),
  useCoachSession: (options: CoachSessionOptions) => {
    coach.options = options;
    const shot: CapturedShot = {
      blob: new Blob(["after"], { type: "image/jpeg" }),
      dataUrl: "data:image/jpeg;base64,QUZURVI=",
      width: 3,
      height: 4,
      score: { total: 72, framing: 80, level: null, pose: 64, crop: null, light: null },
      manual: true,
    };
    return {
      phase: "coaching" as const,
      score: 40,
      parts: { pose: null, framing: null, level: null },
      instruction: null,
      countdown: null,
      personVisible: false,
      fps: 0,
      simulated: false,
      error: null,
      captureNow: () => options.onCapture(shot),
      restart: () => undefined,
    };
  },
}));

vi.mock("@/vision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/vision")>();
  return {
    ...actual,
    requestMotionPermission: vi.fn(async () => false),
    shrinkImage: vi.fn(async () => "data:image/jpeg;base64,QkVGT1JF"),
    scoreStill: vi.fn(async () => ({ total: 31, framing: 40, level: null, pose: 22, crop: null, light: null })),
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analyze: vi.fn(),
      review: vi.fn(),
      feedback: vi.fn(),
      health: vi.fn(),
      recipes: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
    },
  };
});

const analyze = vi.mocked(api.analyze);
const review = vi.mocked(api.review);
const createRecipe = vi.mocked(api.recipes.create);

function choosePicture() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "scene.jpg", { type: "image/jpeg" })] } });
}

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  coach.options = null;
  analyze.mockReset();
  review.mockReset();
  createRecipe.mockReset();
  vi.mocked(api.health).mockResolvedValue(HEALTH_NO_DB);
  review.mockResolvedValue({ ...sampleReview("en"), mock: true });
  setLang("en");
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  URL.createObjectURL = vi.fn(() => "blob:test-picture");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("ShootFlow: starting", () => {
  it("explains a refused camera and still offers a picture", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    render(<ShootFlow />);
    fireEvent.click(button(t("openCamera", "en")));

    expect((await screen.findByRole("alert")).textContent).toBe(t("cameraDenied", "en"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(button(t("openCamera", "en"))).toBeTruthy();
    expect(screen.getByText(t("usePicture", "en"))).toBeTruthy();
    expect(coach.options?.video).toBeNull();
  });

  it("says when there is no secure address for the camera", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    render(<ShootFlow />);
    fireEvent.click(button(t("openCamera", "en")));
    expect((await screen.findByRole("alert")).textContent).toBe(t("insecure", "en"));
  });
});

describe("ShootFlow: a picture instead of the camera", () => {
  it("labels sample ideas, reaches a result, and will not publish a sample as a recipe", async () => {
    analyze.mockResolvedValue({ plan: SAMPLE_PLAN_PERSON, mock: true });
    render(<ShootFlow />);
    choosePicture();

    const read = button(t("readScene", "en"));
    fireEvent.click(read);
    fireEvent.click(read);
    expect(await screen.findByText(t("sample", "en"))).toBeTruthy();
    expect(screen.getByText(t("sampleIdeasNote", "en"))).toBeTruthy();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].image).toBe(BEFORE);

    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    expect(coach.options?.idea).toEqual(SAMPLE_PLAN_PERSON.ideas[0]);
    expect(coach.options?.still).toBe("blob:test-picture");

    act(() => button(t("shutter", "en")).click());
    expect(await screen.findByText(t("sampleReview", "en"))).toBeTruthy();
    expect(review).toHaveBeenCalledTimes(1);
    expect(review.mock.calls[0][0]).toMatchObject({ before: BEFORE, after: AFTER });
    // Before and after totals, and unmeasured parts as words rather than zero.
    expect(screen.getByText("31")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.getAllByText(t("notMeasured", "en")).length).toBeGreaterThan(0);
    expect(screen.getByText(t("rate", "en"))).toBeTruthy();

    fireEvent.click(button(t("makeRecipe", "en")));
    expect(screen.getByText(t("samplePublishBlocked", "en"))).toBeTruthy();
    expect(createRecipe).not.toHaveBeenCalled();
    // The coach is no longer fed once the photo is taken.
    expect(coach.options?.still).toBeNull();
  });

  it("works in Romanian", async () => {
    setLang("ro");
    analyze.mockResolvedValue({ plan: SAMPLE_PLAN_PERSON });
    render(<ShootFlow />);
    choosePicture();
    fireEvent.click(button(t("readScene", "ro")));
    expect(await screen.findByText(t("pickShot", "ro"))).toBeTruthy();
    // A real reading carries no sample label.
    expect(screen.queryByText(t("sample", "ro"))).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "ro") })[0]);
    expect(coach.options?.lang).toBe("ro");
    act(() => button(t("shutter", "ro")).click());
    expect(await screen.findByText(t("rate", "ro"))).toBeTruthy();
    expect(button(t("makeRecipe", "ro"))).toBeTruthy();
  });
});

describe("ShootFlow: recreating a recipe", () => {
  it("coaches the recipe's idea without reading the scene, and compares photos only when asked", async () => {
    const onExit = vi.fn();
    render(<ShootFlow recipe={TEST_RECIPE} onExit={onExit} />);
    expect(screen.getByRole("heading", { level: 1, name: TEST_RECIPE.title })).toBeTruthy();
    expect(screen.getByText(t("privacyRecipe", "en"))).toBeTruthy();
    // Nothing is coached before the user has chosen the camera or a picture.
    expect(coach.options?.video).toBeNull();
    expect(coach.options?.still).toBeNull();

    choosePicture();
    expect(screen.queryByRole("button", { name: t("readScene", "en") })).toBeNull();
    fireEvent.click(button(t("startRecipe", "en")));
    await waitFor(() => expect(coach.options?.still).toBe("blob:test-picture"));
    expect(coach.options?.idea).toEqual(TEST_RECIPE.idea);
    expect(analyze).not.toHaveBeenCalled();

    act(() => button(t("shutter", "en")).click());
    const compare = await screen.findByRole("button", { name: t("askReview", "en") });
    await waitFor(() => expect(compare).toHaveProperty("disabled", false));
    expect(review).not.toHaveBeenCalled();
    // A recipe is not published again from its own recreation.
    expect(screen.queryByRole("button", { name: t("makeRecipe", "en") })).toBeNull();

    fireEvent.click(compare);
    expect(await screen.findByText(t("sampleReview", "en"))).toBeTruthy();
    expect(review).toHaveBeenCalledTimes(1);
    expect(review.mock.calls[0][0]).toMatchObject({ before: BEFORE, after: AFTER, idea: TEST_RECIPE.idea });

    fireEvent.click(button(t("backToRecipe", "en")));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
