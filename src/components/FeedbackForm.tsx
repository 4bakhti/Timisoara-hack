"use client";

/**
 * A 1–5 rating with an optional comment.
 *
 * It only says "saved" when the server confirmed the save. When the feedback
 * route is missing, the storage is down or the phone is offline, it says the
 * feedback was not saved and keeps what was typed so it can be sent again.
 */
import { useEffect, useId, useRef, useState } from "react";
import { field, notice, secondary } from "@/components/styles";
import { t, tf } from "@/i18n/strings";
import { api } from "@/lib/api";
import { APP_VERSION } from "@/lib/brand";
import type { Lang } from "@/lib/contracts";
import { storageMode } from "@/state/storage";

const MAX_COMMENT = 500;
const RATINGS = [1, 2, 3, 4, 5] as const;

type Status = "idle" | "sending" | "saved" | "failed";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `flow-${crypto.randomUUID()}`;
  return `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function FeedbackForm({
  lang,
  round,
  beforeTotal,
  afterTotal,
}: {
  lang: Lang;
  round?: string;
  /** The result screen's "before" total; left out when that picture was not scored. */
  beforeTotal?: number | null;
  afterTotal?: number | null;
}) {
  const groupId = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  /** true when the save went to storage that does not survive a server restart. */
  const [temporary, setTemporary] = useState(false);
  const [offline, setOffline] = useState(false);
  /** Blocks a second tap before React has re-drawn the disabled button. */
  const inFlight = useRef(false);
  /** The same code is reused when retrying, so a server can recognise a repeat. */
  const sessionId = useRef<string | null>(null);

  const outcome = useRef<HTMLParagraphElement>(null);

  const locked = status === "sending" || status === "saved";

  // The outcome usually lands below the visible part of the screen: bring it into view.
  useEffect(() => {
    if (status === "saved" || status === "failed") outcome.current?.scrollIntoView?.({ block: "nearest" });
  }, [status]);

  const send = async () => {
    if (rating === null || inFlight.current || status === "saved") return;
    inFlight.current = true;
    setStatus("sending");
    sessionId.current ??= newSessionId();
    const text = comment.trim();
    let saved = false;
    let hasDatabase = true;
    try {
      const [ok, health] = await Promise.all([
        api.feedback({
          sessionId: sessionId.current,
          appVersion: APP_VERSION,
          rating,
          ...(text ? { comment: text } : {}),
          ...(round ? { round } : {}),
          ...(typeof beforeTotal === "number" ? { beforeTotal: Math.round(beforeTotal) } : {}),
          ...(typeof afterTotal === "number" ? { afterTotal: Math.round(afterTotal) } : {}),
        }),
        api.health(),
      ]);
      saved = ok === true;
      hasDatabase = storageMode(health) === "database";
    } catch {
      saved = false;
    }
    inFlight.current = false;
    setTemporary(saved && !hasDatabase);
    setOffline(!saved && typeof navigator !== "undefined" && navigator.onLine === false);
    setStatus(saved ? "saved" : "failed");
  };

  return (
    <form
      className="grid gap-3 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <fieldset disabled={locked} className="grid gap-2">
        <legend className="w-full text-center text-sm text-neutral-200">{t("rate", lang)}</legend>
        <div className="mt-2 flex justify-center gap-2">
          {RATINGS.map((n) => (
            <label key={n} className="relative">
              <input
                type="radio"
                name={`${groupId}-rating`}
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                aria-label={tf("ratingOption", lang, { n })}
                className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
              />
              <span
                aria-hidden="true"
                className={`grid h-12 w-12 place-items-center rounded-full text-base font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white ${
                  rating !== null && n <= rating ? "bg-green-400 text-black" : "bg-white/10"
                }`}
              >
                {n}
              </span>
            </label>
          ))}
        </div>
        <p className="text-center text-xs text-neutral-400">{t("rateScale", lang)}</p>
      </fieldset>

      <label className="grid gap-1 text-sm text-neutral-200">
        {t("commentLabel", lang)}
        <textarea
          className={`${field} min-h-24 resize-y`}
          value={comment}
          onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT))}
          maxLength={MAX_COMMENT}
          rows={3}
          disabled={locked}
          placeholder={t("commentPlaceholder", lang)}
        />
      </label>
      <p className="flex justify-between gap-3 text-xs text-neutral-400">
        <span>{t("feedbackPrivacy", lang)}</span>
        <span className="shrink-0 tabular-nums">
          {comment.length}/{MAX_COMMENT}
        </span>
      </p>

      {status === "saved" ? (
        <p ref={outcome} role="status" className={temporary ? notice : "rounded-xl bg-green-400/15 p-3 text-sm leading-snug text-green-200"}>
          {t(temporary ? "feedbackSavedTemp" : "feedbackSaved", lang)}
        </p>
      ) : (
        <>
          {status === "failed" && (
            <p ref={outcome} role="alert" className={`${notice} scroll-mb-24`}>
              <strong className="font-semibold">{t("feedbackFailed", lang)}</strong>{" "}
              {t(offline ? "feedbackFailedOffline" : "feedbackFailedServer", lang)}
            </p>
          )}
          <button type="submit" className={secondary} disabled={rating === null || status === "sending"}>
            {t(status === "sending" ? "sending" : status === "failed" ? "retry" : "sendFeedback", lang)}
          </button>
          {rating === null && <p className="text-center text-xs text-neutral-400">{t("pickRating", lang)}</p>}
        </>
      )}
    </form>
  );
}
