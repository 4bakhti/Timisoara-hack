"use client";

/**
 * The "Talk to the coach" control: a toggle, the consent line shown before the
 * microphone starts, the connection status, and a mic mute.
 *
 * The parent only renders this when the server reports that a voice
 * conversation is configured. Starting happens in the tap on "Start talking",
 * so the browser can unlock audio and ask for the microphone in that gesture.
 */
import { useState } from "react";
import { pill } from "@/components/styles";
import { t, type StringKey } from "@/i18n/strings";
import type { Lang } from "@/lib/contracts";
import type { VoiceDirectorState, VoiceUnavailableReason } from "@/voice";

const STATUS: Record<VoiceDirectorState["status"], StringKey> = {
  disconnected: "talkStatusDisconnected",
  connecting: "talkStatusConnecting",
  listening: "talkStatusListening",
  speaking: "talkStatusSpeaking",
  error: "talkStatusError",
};

const REASON: Record<VoiceUnavailableReason, StringKey> = {
  not_configured: "talkReasonNotConfigured",
  microphone_unavailable: "talkReasonMic",
  permission_denied: "talkReasonDenied",
  rate_limited: "talkReasonRate",
  provider_unavailable: "talkReasonProvider",
  connection_lost: "talkReasonLost",
};

const DOT: Record<VoiceDirectorState["status"], string> = {
  disconnected: "bg-neutral-400",
  connecting: "bg-amber-300",
  listening: "bg-green-400",
  speaking: "bg-sky-300",
  error: "bg-red-400",
};

export function VoiceControl({
  lang,
  state,
  talking,
  onStart,
  onStop,
  onToggleMic,
}: {
  lang: Lang;
  state: VoiceDirectorState;
  talking: boolean;
  /** Called from the tap on "Start talking": unlock audio and start the conversation there. */
  onStart: () => void;
  onStop: () => void;
  onToggleMic: () => void;
}) {
  const [asking, setAsking] = useState(false);

  if (!talking) {
    return (
      <div className="grid justify-items-start gap-2" data-testid="voice-control">
        {asking ? (
          <div className="grid max-w-sm gap-3 rounded-2xl bg-black/80 p-3 text-sm leading-snug backdrop-blur" role="group" aria-label={t("talkStart", lang)}>
            <p>{t("talkConsent", lang)}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-full bg-green-400 px-4 font-semibold text-black active:scale-95"
                onClick={() => {
                  setAsking(false);
                  onStart();
                }}
              >
                {t("talkAgree", lang)}
              </button>
              <button type="button" className={pill} onClick={() => setAsking(false)}>
                {t("cancel", lang)}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={pill} onClick={() => setAsking(true)}>
            {t("talkStart", lang)}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-2" data-testid="voice-control">
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black/70 px-3 text-sm backdrop-blur">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DOT[state.status]}`} />
          {t(STATUS[state.status], lang)}
        </span>
        <button type="button" className={pill} onClick={onToggleMic} aria-pressed={state.micMuted}>
          {t(state.micMuted ? "talkUnmute" : "talkMute", lang)}
        </button>
        <button type="button" className={pill} onClick={onStop}>
          {t("talkStop", lang)}
        </button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="max-w-sm rounded-xl bg-black/80 px-3 py-2 text-sm leading-snug text-amber-200">
          {state.reason ? `${t(REASON[state.reason], lang)} ` : ""}
          {t("talkTouchStillWorks", lang)}
        </p>
      )}
    </div>
  );
}
