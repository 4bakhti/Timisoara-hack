// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "@/components/FeedbackForm";
import { deferred, HEALTH_NO_DB, HEALTH_WITH_DB } from "@/components/test-fixtures";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, feedback: vi.fn(), health: vi.fn() } };
});

const feedback = vi.mocked(api.feedback);
const health = vi.mocked(api.health);

const SAVED = t("feedbackSaved", "en");
const SAVED_TEMP = t("feedbackSavedTemp", "en");
const NOT_SAVED = t("feedbackFailed", "en");

const pick = (n: number) => fireEvent.click(screen.getByRole("radio", { name: `${n} out of 5` }));
const sendButton = () => screen.getByRole("button", { name: t("sendFeedback", "en") });
const comment = () => screen.getByLabelText(t("commentLabel", "en")) as HTMLTextAreaElement;

beforeEach(() => {
  feedback.mockReset();
  health.mockReset();
  health.mockResolvedValue(HEALTH_WITH_DB);
});
afterEach(cleanup);

describe("FeedbackForm", () => {
  it("sends nothing until a rating is chosen", () => {
    render(<FeedbackForm lang="en" />);
    expect(sendButton()).toHaveProperty("disabled", true);
    fireEvent.submit(sendButton().closest("form")!);
    expect(feedback).not.toHaveBeenCalled();
  });

  it("says saved only after the server confirmed it", async () => {
    const pending = deferred<boolean>();
    feedback.mockReturnValue(pending.promise);
    render(<FeedbackForm lang="en" />);
    pick(4);
    fireEvent.change(comment(), { target: { value: "  The outline helped.  " } });
    fireEvent.click(sendButton());

    // Still on its way: no thanks yet.
    expect(screen.getByRole("button", { name: t("sending", "en") })).toHaveProperty("disabled", true);
    expect(screen.queryByText(SAVED)).toBeNull();

    pending.resolve(true);
    expect(await screen.findByText(SAVED)).toBeTruthy();
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(feedback.mock.calls[0][0]).toMatchObject({ rating: 4, comment: "The outline helped." });
    // Locked afterwards, so the same feedback cannot be sent twice.
    expect(screen.queryByRole("button", { name: t("sendFeedback", "en") })).toBeNull();
    expect(comment().disabled).toBe(true);
  });

  it("leaves the comment out when it is empty", async () => {
    feedback.mockResolvedValue(true);
    render(<FeedbackForm lang="en" />);
    pick(5);
    fireEvent.click(sendButton());
    await screen.findByText(SAVED);
    expect(feedback.mock.calls[0][0]).not.toHaveProperty("comment");
  });

  it("says when the save went to temporary demo storage", async () => {
    feedback.mockResolvedValue(true);
    health.mockResolvedValue(HEALTH_NO_DB);
    render(<FeedbackForm lang="en" />);
    pick(3);
    fireEvent.click(sendButton());
    expect(await screen.findByText(SAVED_TEMP)).toBeTruthy();
    expect(screen.queryByText(SAVED)).toBeNull();
  });

  it("says it was not saved when the route is missing, keeps the input, and retries with the same session code", async () => {
    feedback.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<FeedbackForm lang="en" />);
    pick(2);
    fireEvent.change(comment(), { target: { value: "Too fast" } });
    fireEvent.click(sendButton());

    expect((await screen.findByRole("alert")).textContent).toContain(NOT_SAVED);
    expect(screen.queryByText(SAVED)).toBeNull();
    expect(screen.queryByText(SAVED_TEMP)).toBeNull();
    expect(comment().value).toBe("Too fast");
    expect((screen.getByRole("radio", { name: "2 out of 5" }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: t("retry", "en") }));
    expect(await screen.findByText(SAVED)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(feedback).toHaveBeenCalledTimes(2);
    expect(feedback.mock.calls[1][0].sessionId).toBe(feedback.mock.calls[0][0].sessionId);
  });

  it("treats a thrown error as not saved", async () => {
    feedback.mockRejectedValue(new Error("boom"));
    render(<FeedbackForm lang="en" />);
    pick(1);
    fireEvent.click(sendButton());
    expect((await screen.findByRole("alert")).textContent).toContain(NOT_SAVED);
  });

  it("sends once however many times the button is tapped", async () => {
    const pending = deferred<boolean>();
    feedback.mockReturnValue(pending.promise);
    render(<FeedbackForm lang="en" />);
    pick(5);
    const form = sendButton().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);
    pending.resolve(true);
    await screen.findByText(SAVED);
    fireEvent.submit(form);
    await waitFor(() => expect(feedback).toHaveBeenCalledTimes(1));
  });

  it("speaks Romanian", async () => {
    feedback.mockResolvedValue(false);
    render(<FeedbackForm lang="ro" />);
    fireEvent.click(screen.getByRole("radio", { name: "4 din 5" }));
    fireEvent.click(screen.getByRole("button", { name: t("sendFeedback", "ro") }));
    expect((await screen.findByRole("alert")).textContent).toContain(t("feedbackFailed", "ro"));
  });
});
