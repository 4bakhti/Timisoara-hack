"use client";

/**
 * The whole shooting flow on one screen:
 *   intro → camera → reading the scene → three ideas → coaching → result.
 *
 * One <video> element stays mounted through every step, so the camera is asked
 * for once and never restarts. Without a camera, a chosen picture stands in.
 *
 * Given a `recipe`, the scene is not read: once the user has started the camera
 * (or chosen a picture), the recipe's idea goes straight to the coach.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { unlockAudio, useCoachSession, type CapturedShot } from "@/coach";
import { FeedbackForm } from "@/components/FeedbackForm";
import { IdeaCard } from "@/components/IdeaCard";
import { LangToggle } from "@/components/LangToggle";
import { RecipePublisher } from "@/components/RecipePublisher";
import { ScoreRing } from "@/components/ScoreRing";
import { card, pill, primary, secondary } from "@/components/styles";
import { t, type StringKey } from "@/i18n/strings";
import { api } from "@/lib/api";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import type { CoachMode, Lang, Recipe, ReviewResponse, ShotIdea, ShotPlan, ShotScore } from "@/lib/contracts";
import { SAMPLE_PLAN_PERSON } from "@/lib/fixtures";
import { useLang } from "@/state/lang";
import { grabFrame, requestMotionPermission, scoreStill, shrinkImage } from "@/vision";

type Step = "intro" | "camera" | "reading" | "ideas" | "coach" | "result";
type Facing = "environment" | "user";

const READING_LINES: StringKey[] = ["reading1", "reading2", "reading3"];
const SCORE_PARTS = ["pose", "framing", "crop", "light", "level"] as const;
/** Sent to the review when the "before" picture could not be scored. Never shown as a result. */
const UNSCORED: ShotScore = { total: 0, framing: null, level: null, pose: null, crop: null, light: null };

const overCamera = "rounded-2xl bg-black/65 p-3 backdrop-blur";
const sampleTag = "rounded-full bg-amber-400/20 px-3 py-1 text-xs font-normal text-amber-200";

/** A dash for sighted users, the words for screen readers. Never a zero. */
function NotMeasured({ lang }: { lang: Lang }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{t("notMeasured", lang)}</span>
    </>
  );
}

export function ShootFlow({ recipe, onExit }: { recipe?: Recipe; onExit?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pictureUrlRef = useRef<string | null>(null);
  /** Blocks a second tap while a frame is being grabbed or the scene is being read. */
  const busyRef = useRef(false);
  /** Bumped for every idea that is started, so answers for an earlier shot are dropped. */
  const runRef = useRef(0);

  const lang = useLang();
  const [live, setLive] = useState<HTMLVideoElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [mode, setMode] = useState<CoachMode>("friend");
  const [voice, setVoice] = useState(true);
  const [facing, setFacing] = useState<Facing>("environment");
  const [problem, setProblem] = useState<StringKey | null>(null);

  const [before, setBefore] = useState<string | null>(null);
  const [plan, setPlan] = useState<ShotPlan | null>(null);
  const [mock, setMock] = useState(false);
  const [idea, setIdea] = useState<ShotIdea | null>(null);
  const [shot, setShot] = useState<CapturedShot | null>(null);
  const [captures, setCaptures] = useState(0);
  const [beforeScore, setBeforeScore] = useState<ShotScore | null>(null);
  const [beforeScored, setBeforeScored] = useState(false);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [readingLine, setReadingLine] = useState(0);

  const mirrored = live !== null && facing === "user";
  const coaching = step === "coach" && idea !== null;

  /** Sends both photos to be compared. Only ever called after the user asked for it. */
  const compare = async (captured: CapturedShot, chosen: ShotIdea, beforeImage: string, scored: ShotScore | null, run: number) => {
    setReviewing(true);
    const answer = await api.review({
      before: beforeImage,
      after: captured.dataUrl,
      idea: chosen,
      scores: { before: scored ?? UNSCORED, after: captured.score },
      lang,
    });
    if (runRef.current !== run) return;
    setReview(answer);
    setReviewing(false);
  };

  const finishResult = async (captured: CapturedShot, chosen: ShotIdea, beforeImage: string, run: number) => {
    let scored: ShotScore | null = null;
    try {
      scored = await scoreStill(beforeImage, chosen, mode);
    } catch {
      scored = null;
    }
    if (runRef.current !== run) return;
    setBeforeScore(scored);
    setBeforeScored(true);
    // "Read my scene" already sent a picture, so the comparison follows on its own.
    // A recipe never read the scene: nothing has left the phone, and comparing is offered as a choice.
    if (!recipe) await compare(captured, chosen, beforeImage, scored, run);
  };

  const handleCapture = (captured: CapturedShot) => {
    setShot(captured);
    setCaptures((count) => count + 1);
    setStep("result");
    if (idea && before) void finishResult(captured, idea, before, runRef.current);
    else setBeforeScored(true);
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
    const stream = streamRef;
    const pictureUrl = pictureUrlRef;
    return () => {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (pictureUrl.current) URL.revokeObjectURL(pictureUrl.current);
    };
  }, []);

  useEffect(() => {
    if (step !== "reading") return;
    const id = window.setInterval(() => setReadingLine((n) => n + 1), 1100);
    return () => window.clearInterval(id);
  }, [step]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(null);
  };

  const startCamera = async (wanted: Facing) => {
    setProblem(null);
    unlockAudio();
    void requestMotionPermission();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setProblem("insecure");
      return;
    }
    try {
      stopCamera();
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
      stopCamera();
      setProblem(name === "NotAllowedError" || name === "SecurityError" ? "cameraDenied" : "cameraMissing");
      // A failed camera switch leaves nothing to look at: go back to where the choices are.
      setStep("intro");
    }
  };

  const choosePicture = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // So choosing the same picture again still counts as a change.
    if (!file) return;
    unlockAudio();
    setProblem(null);
    stopCamera();
    if (pictureUrlRef.current) URL.revokeObjectURL(pictureUrlRef.current);
    const url = URL.createObjectURL(file);
    pictureUrlRef.current = url;
    setPicture(url);
    setStep("camera");
  };

  /** Back to the first screen: the camera is released and can be asked for again. */
  const leaveSource = () => {
    stopCamera();
    setPicture(null);
    setProblem(null);
    setStep("intro");
  };

  const currentFrame = async (): Promise<string> =>
    live ? (await grabFrame(live, { maxSide: 1024, mirrored, quality: 0.85 })).dataUrl : shrinkImage(picture ?? "", 1024);

  const choose = (chosen: ShotIdea) => {
    unlockAudio();
    runRef.current += 1;
    setIdea(chosen);
    setShot(null);
    setBeforeScore(null);
    setBeforeScored(false);
    setReview(null);
    setReviewing(false);
    setStep("coach");
  };

  const readScene = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setProblem(null);
    try {
      let image: string;
      try {
        image = await currentFrame();
      } catch {
        setProblem("frameFailed");
        return;
      }
      setBefore(image);
      setReadingLine(0);
      setStep("reading");
      const answer = await api.analyze({ image, lang, mode });
      setPlan(answer.plan);
      setMock(Boolean(answer.mock));
      setStep("ideas");
    } finally {
      busyRef.current = false;
    }
  };

  /** Recipe: keep a "before" frame on the phone and coach the recipe's idea. Nothing is sent. */
  const startRecipe = async () => {
    if (!recipe || busyRef.current) return;
    busyRef.current = true;
    unlockAudio();
    setProblem(null);
    try {
      setBefore(await currentFrame());
      choose(recipe.idea);
    } catch {
      setProblem("frameFailed");
    } finally {
      busyRef.current = false;
    }
  };

  const askReview = () => {
    if (!shot || !idea || !before || reviewing || review) return;
    void compare(shot, idea, before, beforeScore, runRef.current);
  };

  const share = async () => {
    if (!shot) return;
    const name = `${APP_NAME.toLowerCase()}.jpg`;
    const file = new File([shot.blob], name, { type: "image/jpeg" });
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
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const flipClass = mirrored ? "-scale-x-100" : "";
  const showStill = (step === "reading" || step === "ideas") && before;
  const instruction =
    session.error === "tracker_unavailable"
      ? t("noTracking", lang)
      : session.phase === "loading"
        ? t("starting", lang)
        : (session.instruction?.text ?? idea?.subject?.say ?? idea?.photographer.say ?? "");

  const modeButton = (
    <button type="button" className={pill} onClick={() => setMode(mode === "friend" ? "solo" : "friend")}>
      {t(mode, lang)}
    </button>
  );
  const voiceButton = (
    <button type="button" className={pill} onClick={() => setVoice(!voice)} aria-pressed={voice}>
      {t(voice ? "voiceOn" : "voiceOff", lang)}
    </button>
  );
  const problemNote = problem && (
    <p role="alert" className="rounded-xl bg-black/75 p-3 text-sm leading-snug text-amber-200 backdrop-blur">
      {t(problem, lang)}
    </p>
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
        <section className="absolute inset-0 flex flex-col justify-between gap-6 overflow-y-auto bg-neutral-950 p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2">
            {onExit ? (
              <button type="button" className={pill} onClick={onExit}>
                {t("backToRecipe", lang)}
              </button>
            ) : (
              <Link href="/" className={pill}>
                {t("home", lang)}
              </Link>
            )}
            <LangToggle />
          </div>
          {recipe ? (
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-green-300">{t("recreating", lang)}</p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight">{recipe.title}</h1>
              <p className="mt-3 text-lg leading-snug text-neutral-300">{recipe.idea.photographer.say}</p>
            </div>
          ) : (
            <div>
              <h1 className="text-5xl font-semibold tracking-tight">{APP_NAME}</h1>
              <p className="mt-3 text-xl leading-snug text-neutral-300">{APP_TAGLINE[lang]}</p>
            </div>
          )}
          <div className="grid gap-3">
            {problem && (
              <p role="alert" className="rounded-xl bg-amber-400/15 p-3 text-sm leading-snug text-amber-200">
                {t(problem, lang)}
              </p>
            )}
            <button type="button" className={primary} onClick={() => startCamera(facing)}>
              {t("openCamera", lang)}
            </button>
            <label className={`${secondary} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white`}>
              {t("usePicture", lang)}
              <input type="file" accept="image/*" className="sr-only" onChange={(event) => choosePicture(event.currentTarget)} />
            </label>
            <p className="text-center text-xs text-neutral-400">{t(recipe ? "privacyRecipe" : "privacy", lang)}</p>
          </div>
        </section>
      )}

      {step === "camera" && (
        <section className="absolute inset-0 flex flex-col justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={pill} onClick={leaveSource}>
              {t("back", lang)}
            </button>
            <LangToggle />
            {modeButton}
            {voiceButton}
            {live && (
              <button type="button" className={pill} onClick={() => startCamera(facing === "user" ? "environment" : "user")}>
                {t("flip", lang)}
              </button>
            )}
          </div>
          <div className="grid gap-3">
            {problemNote}
            {recipe && (
              <div className={overCamera}>
                <p className="text-xs font-medium uppercase tracking-wide text-green-300">{t("recreating", lang)}</p>
                <p className="font-semibold leading-tight">{recipe.title}</p>
                <p className="mt-1 text-sm leading-snug text-neutral-200">{recipe.idea.photographer.say}</p>
              </div>
            )}
            <button type="button" className={primary} onClick={recipe ? startRecipe : readScene}>
              {t(recipe ? "startRecipe" : "readScene", lang)}
            </button>
          </div>
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
        <section className="absolute inset-0 flex flex-col overflow-y-auto bg-gradient-to-t from-black/85 via-black/30 to-transparent pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mt-auto">
            <div className="flex items-center justify-between gap-2 px-4 pb-3">
              <h2 className="text-2xl font-semibold">{t("pickShot", lang)}</h2>
              <span className="flex items-center gap-2">
                {mock && <span className={sampleTag}>{t("sample", lang)}</span>}
                <button type="button" className={pill} onClick={() => setStep("camera")}>
                  {t("back", lang)}
                </button>
              </span>
            </div>
            {mock && <p className="px-4 pb-3 text-sm leading-snug text-amber-200">{t("sampleIdeasNote", lang)}</p>}
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
              {plan.ideas.map((item) => (
                <IdeaCard key={item.id} idea={item} lang={lang} onUse={() => choose(item)} />
              ))}
            </div>
          </div>
        </section>
      )}

      {coaching && (
        <section className="absolute inset-0 flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={pill} onClick={() => setStep(plan && !recipe ? "ideas" : "camera")}>
                {t("back", lang)}
              </button>
              {voiceButton}
              {modeButton}
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
            <button
              type="button"
              className="min-h-12 w-full rounded-full bg-white px-5 py-3 text-base font-semibold text-black active:scale-[0.98]"
              onClick={session.captureNow}
            >
              {t("shutter", lang)}
            </button>
          </div>
        </section>
      )}

      {step === "result" && shot && idea && (
        <section className="absolute inset-0 overflow-y-auto bg-neutral-950 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
          {recipe && <h1 className="mb-3 text-xl font-semibold leading-tight">{recipe.title}</h1>}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t("before", lang), src: before, score: beforeScore, pending: !beforeScored },
              { label: t("after", lang), src: shot.dataUrl, score: shot.score, pending: false },
            ].map((side) => (
              <figure key={side.label}>
                {side.src && (
                  // eslint-disable-next-line @next/next/no-img-element -- captured frames, data URLs
                  <img src={side.src} alt={side.label} className="aspect-[3/4] w-full rounded-xl object-cover" />
                )}
                <figcaption className="mt-2 flex items-baseline justify-between">
                  <span className="text-sm text-neutral-400">{side.label}</span>
                  <span className="text-3xl font-semibold tabular-nums">
                    {side.pending ? "…" : side.score ? side.score.total : <NotMeasured lang={lang} />}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>

          <dl className={`mt-4 grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 text-sm ${card}`}>
            <dt />
            <dd className="text-right text-neutral-400">{t("before", lang)}</dd>
            <dd className="text-right text-neutral-400">{t("after", lang)}</dd>
            {SCORE_PARTS.map((part) => (
              <div key={part} className="contents">
                <dt>{t(part, lang)}</dt>
                <dd className="text-right tabular-nums text-neutral-300">
                  {!beforeScored ? "…" : (beforeScore?.[part] ?? <NotMeasured lang={lang} />)}
                </dd>
                <dd className="text-right font-semibold tabular-nums">{shot.score[part] ?? <NotMeasured lang={lang} />}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs leading-snug text-neutral-400">
            <span aria-hidden="true">{t("notMeasuredKey", lang)}. </span>
            {t("scoreNote", lang)}
          </p>

          <div className={`mt-4 ${card}`}>
            <h2 className="flex flex-wrap items-center justify-between gap-2 text-lg font-semibold">
              {t("improved", lang)}
              {review?.mock && <span className={sampleTag}>{t("sampleReview", lang)}</span>}
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
            ) : reviewing || !recipe ? (
              <p className="mt-2 text-sm text-neutral-400" aria-live="polite">
                {t(beforeScored ? "comparing" : "scoring", lang)}
              </p>
            ) : (
              <>
                <h3 className="mt-3 text-xs uppercase tracking-wide text-neutral-400">{t("whyItWorks", lang)}</h3>
                <p className="mt-1 text-sm leading-snug text-neutral-200">{idea.why}</p>
                <button type="button" className={`${secondary} mt-4`} onClick={askReview} disabled={!beforeScored}>
                  {t("askReview", lang)}
                </button>
                <p className="mt-2 text-center text-xs text-neutral-400">{t("askReviewNote", lang)}</p>
              </>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-neutral-400">{t("realPhoto", lang)}</p>

          <div className="mt-4 grid gap-3">
            <button type="button" className={primary} onClick={share}>
              {t("save", lang)}
            </button>
            {plan && !recipe && (
              <button type="button" className={secondary} onClick={() => setStep("ideas")}>
                {t("another", lang)}
              </button>
            )}
            <button type="button" className={secondary} onClick={() => setStep("camera")}>
              {t(recipe ? "shootAgain" : "newScene", lang)}
            </button>
            {recipe && onExit && (
              <button type="button" className={secondary} onClick={onExit}>
                {t("backToRecipe", lang)}
              </button>
            )}
          </div>

          {!recipe && (
            <div className="mt-6">
              <RecipePublisher key={captures} idea={idea} sample={mock} lang={lang} />
            </div>
          )}

          <div className="mt-8">
            <FeedbackForm key={captures} lang={lang} />
          </div>
        </section>
      )}
    </main>
  );
}
