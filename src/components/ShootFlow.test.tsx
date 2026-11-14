// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedShot, CoachSessionOptions } from "@/coach";
import { ShootFlow } from "@/components/ShootFlow";
import { deferred, HEALTH_NO_DB, TEST_IDEA_NO_PERSON, TEST_RECIPE } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import type { ReviewResponse } from "@/lib/contracts";
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
      requestCapture: async () => {
        options.onCapture(shot);
        return { ok: true as const, outcome: "captured" as const };
      },
      cancelPendingCapture: () => undefined,
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
  vi.mocked(api.feedback).mockReset();
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

describe("ShootFlow: answers that arrive late", () => {
  it("keeps the current shot's review when an earlier shot's review arrives afterwards", async () => {
    analyze.mockResolvedValue({ plan: SAMPLE_PLAN_PERSON });
    const reviewA = deferred<ReviewResponse>();
    const reviewB = deferred<ReviewResponse>();
    review.mockReset();
    review.mockReturnValueOnce(reviewA.promise).mockReturnValueOnce(reviewB.promise);
    const answer = (text: string): ReviewResponse => ({ improved: [text], lesson: { title: `${text} lesson`, text: `${text} text` } });

    render(<ShootFlow />);
    choosePicture();
    fireEvent.click(button(t("readScene", "en")));
    await screen.findByText(t("pickShot", "en"));

    // Shot A: its review stays out.
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    act(() => button(t("shutter", "en")).click());
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));

    // Shot B, with another idea: its review comes back first.
    fireEvent.click(button(t("another", "en")));
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[1]);
    act(() => button(t("shutter", "en")).click());
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
    expect(review.mock.calls[1][0].idea).toEqual(SAMPLE_PLAN_PERSON.ideas[1]);
    await act(async () => reviewB.resolve(answer("Review B")));
    expect(await screen.findByText("Review B")).toBeTruthy();

    // Now the old one lands. It must not replace what is on screen.
    await act(async () => reviewA.resolve(answer("Review A")));
    expect(screen.getByText("Review B")).toBeTruthy();
    expect(screen.queryByText("Review A")).toBeNull();
  });

  it("ignores a photo delivered after the user went back from coaching", async () => {
    analyze.mockResolvedValue({ plan: SAMPLE_PLAN_PERSON });
    render(<ShootFlow />);
    choosePicture();
    fireEvent.click(button(t("readScene", "en")));
    await screen.findByText(t("pickShot", "en"));
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    fireEvent.click(button(t("back", "en")));
    await screen.findByText(t("pickShot", "en"));

    // A stopped session that still fires reaches the screen through the hook's latest callback.
    const late: CapturedShot = {
      blob: new Blob(["late"]),
      dataUrl: AFTER,
      width: 3,
      height: 4,
      score: { total: 1, framing: null, level: null, pose: null, crop: null, light: null },
      manual: true,
    };
    act(() => coach.options!.onCapture(late));
    expect(screen.getByText(t("pickShot", "en"))).toBeTruthy();
    expect(screen.queryByText(t("improved", "en"))).toBeNull();
    expect(review).not.toHaveBeenCalled();
  });
});

describe("ShootFlow: recreating a recipe", () => {
  it("says up front that a shot without a person sends frames while the coach runs", () => {
    render(<ShootFlow recipe={{ ...TEST_RECIPE, idea: TEST_IDEA_NO_PERSON }} />);
    expect(screen.getByText(t("privacyRecipeGuided", "en"))).toBeTruthy();
    expect(screen.queryByText(t("privacyRecipe", "en"))).toBeNull();
  });

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

describe("ShootFlow: demo mode", () => {
  it("runs on the drawing, the sample plan, the scripted coach and the sample review, with no calls to the server", async () => {
    const { deviceSpeech } = await import("@/components/deviceSpeech");
    const { DEMO_SCENE } = await import("@/components/ShootFlow");
    const badge = () => screen.getAllByText(t("demoBadge", "en")).length;
    render(<ShootFlow demo />);

    expect(badge()).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: t("openCamera", "en") })).toBeNull();
    fireEvent.click(button(t("demoStart", "en")));
    expect(badge()).toBeGreaterThan(0);

    fireEvent.click(button(t("demoRead", "en")));
    expect(await screen.findByText(t("demoIdeasNote", "en"))).toBeTruthy();
    expect(badge()).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    expect(coach.options?.engine).toBe("sim");
    expect(coach.options?.still).toBe(DEMO_SCENE);
    expect(coach.options?.speech).toBe(deviceSpeech);
    expect(screen.getByText(t("demoCoachNote", "en"))).toBeTruthy();
    expect(badge()).toBeGreaterThan(0);

    act(() => button(t("shutter", "en")).click());
    expect(await screen.findByText(t("demoReviewNote", "en"))).toBeTruthy();
    expect(badge()).toBeGreaterThan(0);
    expect(screen.getByText(t("demoPhotoNote", "en"))).toBeTruthy();
    expect(screen.queryByText(t("realPhoto", "en"))).toBeNull();

    // Recipes and feedback are off, with the reason.
    expect(screen.getByText(t("demoNoRecipe", "en"))).toBeTruthy();
    expect(screen.getByText(t("demoNoFeedback", "en"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("makeRecipe", "en") })).toBeNull();
    expect(screen.queryByText(t("rate", "en"))).toBeNull();

    expect(analyze).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(createRecipe).not.toHaveBeenCalled();
    expect(api.feedback).not.toHaveBeenCalled();
  });

  it("is labelled in Romanian too", () => {
    setLang("ro");
    render(<ShootFlow demo />);
    expect(screen.getAllByText(t("demoBadge", "ro")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: t("demoStart", "ro") })).toBeTruthy();
  });

  it("is offered when the camera is refused, and when the scene could not be read", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new DOMException("denied", "NotAllowedError"); }) },
    });
    render(<ShootFlow />);
    fireEvent.click(button(t("openCamera", "en")));
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: t("watchDemo", "en") }).getAttribute("href")).toBe("/demo");
    cleanup();

    analyze.mockResolvedValue({ plan: SAMPLE_PLAN_PERSON, mock: true });
    render(<ShootFlow />);
    choosePicture();
    fireEvent.click(button(t("readScene", "en")));
    await screen.findByText(t("sampleIdeasNote", "en"));
    expect(screen.getByRole("link", { name: t("watchDemo", "en") })).toBeTruthy();
  });
});

describe("ShootFlow: test-round label", () => {
  it("passes the round to the feedback it sends", async () => {
    analyze.mockResolvedValue({ plan: SAMPLE_PLAN_PERSON });
    vi.mocked(api.feedback).mockResolvedValue(true);
    render(<ShootFlow round="round-1" />);
    choosePicture();
    fireEvent.click(button(t("readScene", "en")));
    await screen.findByText(t("pickShot", "en"));
    fireEvent.click(screen.getAllByRole("button", { name: t("useShot", "en") })[0]);
    act(() => button(t("shutter", "en")).click());
    fireEvent.click(await screen.findByRole("radio", { name: "4 out of 5" }));
    fireEvent.click(button(t("sendFeedback", "en")));
    await waitFor(() => expect(api.feedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.feedback).mock.calls[0][0]).toMatchObject({ rating: 4, round: "round-1" });
  });
});
