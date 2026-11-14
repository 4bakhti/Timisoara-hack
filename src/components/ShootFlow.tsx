"use client";

/**
 * The whole shooting flow on one screen:
 *   intro → camera → reading the scene → three ideas → coaching → result.
 *
 * One <video> element stays mounted through every step, so the camera is asked
 * for once and never restarts. Without a camera, a chosen picture stands in.
 */
import { useEffect, useRef, useState } from "react";
import { unlockAudio, useCoachSession, type CapturedShot } from "@/coach";
import { IdeaCard } from "@/components/IdeaCard";
import { ScoreRing } from "@/components/ScoreRing";
import { t, type StringKey } from "@/i18n/strings";
import { api } from "@/lib/api";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/lib/brand";
import type { CoachMode, Lang, ReviewResponse, ShotIdea, ShotPlan, ShotScore } from "@/lib/contracts";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { grabFrame, requestMotionPermission, scoreStill, shrinkImage } from "@/vision";

type Step = "intro" | "camera" | "reading" | "ideas" | "coach" | "result";
type Facing = "environment" | "user";

const READING_LINES: StringKey[] = ["reading1", "reading2", "reading3"];
const SCORE_PARTS = ["pose", "framing", "crop", "light", "level"] as const;
const UNSCORED: ShotScore = { total: 0, framing: null, level: null, pose: null, crop: null, light: null };

const pill = "rounded-full bg-black/55 px-3 py-2 text-sm font-medium backdrop-blur active:scale-95";
const primary = "w-full rounded-full bg-green-400 px-5 py-4 text-lg font-semibold text-black active:scale-[0.98] disabled:opacity-50";
const secondary = "w-full rounded-full bg-white/10 px-5 py-3 text-base font-medium active:scale-[0.98]";

export function ShootFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [live, setLive] = useState<HTMLVideoElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [lang, setLang] = useState<Lang>("en");
  const [mode, setMode] = useState<CoachMode>("friend");
  const [voice, setVoice] = useState(true);
  const [facing, setFacing] = useState<Facing>("environment");
  const [problem, setProblem] = useState<StringKey | null>(null);

  const [before, setBefore] = useState<string | null>(null);
  const [plan, setPlan] = useState<ShotPlan | null>(null);
  const [mock, setMock] = useState(false);
  const [idea, setIdea] = useState<ShotIdea | null>(null);
  const [shot, setShot] = useState<CapturedShot | null>(null);
  const [beforeScore, setBeforeScore] = useState<ShotScore | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [rated, setRated] = useState<number | null>(null);
  const [readingLine, setReadingLine] = useState(0);

  const mirrored = live !== null && facing === "user";
  const coaching = step === "coach" && idea !== null;

  const finishResult = async (captured: CapturedShot, chosen: ShotIdea, beforeImage: string) => {
    let scored: ShotScore | null = null;
    try {
      scored = await scoreStill(beforeImage, chosen, mode);
    } catch {
      scored = null;
    }
    setBeforeScore(scored ?? UNSCORED);
    setReview(
      await api.review({
        before: beforeImage,
        after: captured.dataUrl,
        idea: chosen,
        scores: { before: scored ?? UNSCORED, after: captured.score },
        lang,
      }),
    );
  };

  const handleCapture = (captured: CapturedShot) => {
    setShot(captured);
    setStep("result");
    if (idea && before) void finishResult(captured, idea, before);
  };

  const session = useCoachSession({
    video: coaching ? live : null,
    still: coaching && !live ? picture : null,
    overlay: canvas,
    idea: idea ?? SAMPLE_PLAN_PERSON.ideas[0],
    mode,
    lang,
    mirrored,
    voice,
    onCapture: handleCapture,
  });

  useEffect(() => {
    const ref = streamRef;
    return () => ref.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (step !== "reading") return;
    const id = window.setInterval(() => setReadingLine((n) => n + 1), 1100);
    return () => window.clearInterval(id);
  }, [step]);

  const startCamera = async (wanted: Facing) => {
    setProblem(null);
    unlockAudio();
    void requestMotionPermission();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setProblem("insecure");
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setLive(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: wanted }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setFacing(wanted);
      setPicture(null);
      setLive(video);
      setStep((current) => (current === "intro" ? "camera" : current));
      try {
        await navigator.wakeLock?.request("screen");
      } catch {
        // Keeping the screen awake is a convenience, not a requirement.
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setProblem(name === "NotAllowedError" || name === "SecurityError" ? "cameraDenied" : "cameraMissing");
    }
  };

  const choosePicture = (file: File | undefined) => {
    if (!file) return;
    unlockAudio();
    setProblem(null);
    setPicture(URL.createObjectURL(file));
    setStep("camera");
  };

  const readScene = async () => {
    let image: string;
    try {
      image = live
        ? (await grabFrame(live, { maxSide: 1024, mirrored, quality: 0.85 })).dataUrl
        : await shrinkImage(picture ?? "", 1024);
    } catch {
      return;
    }
    setBefore(image);
    setReadingLine(0);
    setStep("reading");
    const answer = await api.analyze({ image, lang, mode });
    setPlan(answer.plan);
    setMock(Boolean(answer.mock));
    setStep("ideas");
  };

  const choose = (chosen: ShotIdea) => {
    unlockAudio();
    setIdea(chosen);
    setShot(null);
    setBeforeScore(null);
    setReview(null);
    setRated(null);
    setStep("coach");
  };

  const share = async () => {
    if (!shot) return;
    const file = new File([shot.blob], "framewise.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        // The share sheet was closed.
      }
      return;
    }
    const url = URL.createObjectURL(shot.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "framewise.jpg";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const rate = (rating: number) => {
    setRated(rating);
    sessionIdRef.current ??= `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    void api.feedback({ sessionId: sessionIdRef.current, appVersion: APP_VERSION, rating });
  };

  const flipClass = mirrored ? "-scale-x-100" : "";
  const showStill = (step === "reading" || step === "ideas") && before;
  const instruction =
    session.error === "tracker_unavailable"
      ? t("noTracking", lang)
      : session.phase === "loading"
        ? t("starting", lang)
        : (session.instruction?.text ?? idea?.subject?.say ?? idea?.photographer.say ?? "");

  const topBar = (
    <div className="flex flex-wrap items-center gap-2">
      <button className={pill} onClick={() => setLang(lang === "en" ? "ro" : "en")} aria-label="Language">
        {lang === "en" ? "EN" : "RO"}
      </button>
      <button className={pill} onClick={() => setMode(mode === "friend" ? "solo" : "friend")}>
        {t(mode, lang)}
      </button>
      <button className={pill} onClick={() => setVoice(!voice)}>
        {t(voice ? "voiceOn" : "voiceOff", lang)}
      </button>
      {live && (
        <button className={pill} onClick={() => startCamera(facing === "user" ? "environment" : "user")}>
          {t("flip", lang)}
        </button>
      )}
    </div>
  );

  return (
    <main className="relative mx-auto h-dvh w-full max-w-lg overflow-hidden bg-black text-white">
      <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${flipClass}`} />
      {picture && !live && (
        // eslint-disable-next-line @next/next/no-img-element -- a local picture standing in for the camera
        <img src={picture} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <canvas ref={setCanvas} className={`absolute inset-0 h-full w-full ${flipClass} ${coaching ? "" : "hidden"}`} />
      {showStill && (
        // eslint-disable-next-line @next/next/no-img-element -- the frozen frame, a data URL
        <img src={before} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {step === "intro" && (
        <section className="absolute inset-0 flex flex-col justify-between bg-neutral-950 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-end">
            <button className={pill} onClick={() => setLang(lang === "en" ? "ro" : "en")} aria-label="Language">
              {lang === "en" ? "EN" : "RO"}
            </button>
          </div>
          <div>
            <h1 className="text-5xl font-semibold tracking-tight">{APP_NAME}</h1>
            <p className="mt-3 text-xl leading-snug text-neutral-300">{APP_TAGLINE[lang]}</p>
          </div>
          <div className="grid gap-3">
            {problem && <p className="rounded-xl bg-amber-400/15 p-3 text-sm text-amber-200">{t(problem, lang)}</p>}
            <button className={primary} onClick={() => startCamera(facing)}>
              {t("openCamera", lang)}
            </button>
            <label className={`${secondary} cursor-pointer text-center`}>
              {t("usePicture", lang)}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => choosePicture(e.target.files?.[0])} />
            </label>
            <p className="text-center text-xs text-neutral-400">{t("privacy", lang)}</p>
          </div>
        </section>
      )}

      {step === "camera" && (
        <section className="absolute inset-0 flex flex-col justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {topBar}
          <button className={primary} onClick={readScene}>
            {t("readScene", lang)}
          </button>
        </section>
      )}

      {step === "reading" && (
        <section className="absolute inset-0 grid place-items-center bg-black/55 p-6 text-center" aria-live="polite">
          <div>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/25 border-t-green-400" />
            <p className="mt-5 text-xl font-medium">{t(READING_LINES[readingLine % READING_LINES.length], lang)}</p>
          </div>
        </section>
      )}

      {step === "ideas" && plan && (
        <section className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between px-4 pb-3">
            <h2 className="text-2xl font-semibold">{t("pickShot", lang)}</h2>
            <span className="flex items-center gap-2">
              {mock && <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs text-amber-200">{t("sample", lang)}</span>}
              <button className={pill} onClick={() => setStep("camera")}>
                {t("back", lang)}
              </button>
            </span>
          </div>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
            {plan.ideas.map((item) => (
              <IdeaCard key={item.id} idea={item} lang={lang} onUse={() => choose(item)} />
            ))}
          </div>
        </section>
      )}

      {coaching && (
        <section className="absolute inset-0 flex flex-col justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button className={pill} onClick={() => setStep("ideas")}>
                {t("back", lang)}
              </button>
              <button className={pill} onClick={() => setVoice(!voice)}>
                {t(voice ? "voiceOn" : "voiceOff", lang)}
              </button>
              <button className={pill} onClick={() => setMode(mode === "friend" ? "solo" : "friend")}>
                {t(mode, lang)}
              </button>
            </div>
            <ScoreRing score={session.score} />
          </div>

          {session.countdown !== null && (
            <p className="pointer-events-none absolute inset-0 grid place-items-center text-[10rem] font-bold leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              {session.countdown}
            </p>
          )}

          <div className="grid gap-3">
            <p
              className="rounded-2xl bg-black/60 px-4 py-3 text-center text-2xl font-semibold leading-snug backdrop-blur"
              aria-live="polite"
              data-testid="instruction"
            >
              {instruction}
            </p>
            <button className={secondary} onClick={session.captureNow}>
              {t("shutter", lang)}
            </button>
          </div>
        </section>
      )}

      {step === "result" && shot && (
        <section className="absolute inset-0 overflow-y-auto bg-neutral-950 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t("before", lang), src: before, score: beforeScore },
              { label: t("after", lang), src: shot.dataUrl, score: shot.score },
            ].map((side) => (
              <figure key={side.label}>
                {side.src && (
                  // eslint-disable-next-line @next/next/no-img-element -- captured frames, data URLs
                  <img src={side.src} alt={side.label} className="aspect-[3/4] w-full rounded-xl object-cover" />
                )}
                <figcaption className="mt-2 flex items-baseline justify-between">
                  <span className="text-sm text-neutral-400">{side.label}</span>
                  <span className="text-3xl font-semibold tabular-nums">{side.score ? side.score.total : "…"}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          <dl className="mt-4 grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 rounded-xl bg-white/5 p-4 text-sm">
            <dt />
            <dd className="text-right text-neutral-400">{t("before", lang)}</dd>
            <dd className="text-right text-neutral-400">{t("after", lang)}</dd>
            {SCORE_PARTS.map((part) => (
              <div key={part} className="contents">
                <dt>{t(part, lang)}</dt>
                <dd className="text-right tabular-nums text-neutral-300">
                  {beforeScore ? (beforeScore[part] ?? "–") : "…"}
                </dd>
                <dd className="text-right font-semibold tabular-nums">{shot.score[part] ?? "–"}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 rounded-xl bg-white/5 p-4">
            <h2 className="flex items-center justify-between text-lg font-semibold">
              {t("improved", lang)}
              {review?.mock && <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-normal text-amber-200">{t("sample", lang)}</span>}
            </h2>
            {review ? (
              <>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-200">
                  {review.improved.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <h3 className="mt-4 text-xs uppercase tracking-wide text-neutral-400">{t("lesson", lang)}</h3>
                <p className="mt-1 font-medium">{review.lesson.title}</p>
                <p className="mt-1 text-sm leading-snug text-neutral-300">{review.lesson.text}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">{t("scoring", lang)}</p>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-neutral-400">{t("realPhoto", lang)}</p>

          <div className="mt-4 grid gap-3">
            <button className={primary} onClick={share}>
              {t("save", lang)}
            </button>
            <button className={secondary} onClick={() => setStep("ideas")}>
              {t("another", lang)}
            </button>
            <button className={secondary} onClick={() => setStep("camera")}>
              {t("newScene", lang)}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-neutral-300">{rated ? t("thanks", lang) : t("rate", lang)}</p>
            <div className="mt-2 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`h-11 w-11 rounded-full text-base font-semibold ${rated !== null && n <= rated ? "bg-green-400 text-black" : "bg-white/10"}`}
                  onClick={() => rate(n)}
                  aria-label={`${n} / 5`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
