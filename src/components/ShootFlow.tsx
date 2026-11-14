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
 *
 * With `demo`, nothing touches the camera, the network or the AI: a drawn scene
 * stands in for the camera, the bundled sample plan for the reading, the scripted
 * coach for tracking, and the sample review for the comparison. Every screen says so.
 *
 * Outside the demo, an optional voice conversation can steer the same flow. It is
 * invisible unless the server reports it configured, and starts only from an
 * explicit tap after the user is told that microphone audio goes to ElevenLabs.
 * Spoken commands go through the same functions as the touch controls.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { unlockAudio, useCoachSession, type CapturedShot, type CoachSpeech } from "@/coach";
import { deviceSpeech } from "@/components/deviceSpeech";
import { FeedbackForm } from "@/components/FeedbackForm";
import { IdeaCard } from "@/components/IdeaCard";
import { usePosePreviews } from "@/components/usePosePreviews";
import { LangToggle } from "@/components/LangToggle";
import { RecipePublisher } from "@/components/RecipePublisher";
import { ScoreRing } from "@/components/ScoreRing";
import { card, pill, primary, secondary } from "@/components/styles";
import { VoiceControl } from "@/components/VoiceControl";
import { t, type StringKey } from "@/i18n/strings";
import { api } from "@/lib/api";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import type { CoachMode, Lang, Recipe, ReviewResponse, ShotIdea, ShotPlan, ShotScore } from "@/lib/contracts";
import { SAMPLE_PLAN_PERSON, sampleReview } from "@/lib/fixtures";
import { useLang } from "@/state/lang";
import { grabFrame, requestMotionPermission, scoreStill, shrinkImage, targetFromPreview, pictureAspect, type CustomTarget } from "@/vision";
import { useVoiceDirector, type VoiceActions, type VoiceContext, type VoiceDirector, type VoiceDirectorState } from "@/voice";

type Step = "intro" | "camera" | "reading" | "ideas" | "coach" | "result";
type Facing = "environment" | "user";

const READING_LINES: StringKey[] = ["reading1", "reading2", "reading3"];
/** Drawn for the demo; served from public/. */
export const DEMO_SCENE = "/demo/scene.svg";
/** Camera problems after which the demo is the useful way forward. */
const DEMO_HINT: StringKey[] = ["cameraDenied", "cameraMissing", "insecure"];
const SCORE_PARTS = ["pose", "framing", "crop", "light", "level"] as const;
/** Sent to the review when the "before" picture could not be scored. Never shown as a result. */
const UNSCORED: ShotScore = { total: 0, framing: null, level: null, pose: null, crop: null, light: null };

const overCamera = "rounded-2xl bg-black/65 p-3 backdrop-blur";
const sampleTag = "rounded-full bg-amber-400/20 px-3 py-1 text-xs font-normal text-amber-200";
const demoTag = "inline-flex min-h-8 items-center rounded-full bg-amber-400 px-3 text-xs font-semibold uppercase tracking-wide text-black";
const demoLink = "text-center text-sm text-neutral-300 underline underline-offset-4";

/** A dash for sighted users, the words for screen readers. Never a zero. */
function NotMeasured({ lang }: { lang: Lang }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{t("notMeasured", lang)}</span>
    </>
  );
}

export interface ShootFlowProps {
  recipe?: Recipe;
  onExit?: () => void;
  /** User-testing round label, sent with feedback. */
  round?: string;
  demo?: boolean;
}

/** What the voice conversation lends the flow, and where the flow hands back its action handlers. */
interface Talk {
  director: VoiceDirector;
  state: VoiceDirectorState;
  speech: CoachSpeech;
  register: (handlers: VoiceActions) => void;
}

/** Refreshes the conversation's picture of the screen at least this often while it runs. */
const CONTEXT_EVERY_MS = 2000;

export function ShootFlow(props: ShootFlowProps) {
  // The demo makes no network requests, so it never mounts the voice conversation (which asks the server on mount).
  return props.demo ? <FlowCore {...props} talk={null} /> : <TalkingShootFlow {...props} />;
}

function TalkingShootFlow(props: ShootFlowProps) {
  const handlers = useRef<VoiceActions | null>(null);
  // Stable for the director; each call reaches the flow's current handlers.
  const actions = useMemo<VoiceActions>(
    () => ({
      selectIdea: (ideaId, signal) => handlers.current?.selectIdea(ideaId, signal) ?? { ok: false, reason: "unavailable" },
      setCoachingPaused: (paused, signal) => handlers.current?.setCoachingPaused(paused, signal) ?? { ok: false, reason: "unavailable" },
      requestCapture: (signal) => handlers.current?.requestCapture(signal) ?? { ok: false, reason: "unavailable" },
    }),
    [],
  );
  const { director, state, speech } = useVoiceDirector(actions);
  const register = useCallback((next: VoiceActions) => {
    handlers.current = next;
  }, []);
  const talk = useMemo(() => ({ director, state, speech, register }), [director, state, speech, register]);
  return <FlowCore {...props} talk={talk} />;
}

function FlowCore({ recipe, onExit, round, demo = false, talk }: ShootFlowProps & { talk: Talk | null }) {
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
  /** AI pose previews of the ideas, and the coaching target taken from the chosen one. */
  const previews = usePosePreviews();
  const [target, setTarget] = useState<CustomTarget | undefined>(undefined);
  const targetRef = useRef<CustomTarget | undefined>(undefined);
  const [idea, setIdea] = useState<ShotIdea | null>(null);
  const [shot, setShot] = useState<CapturedShot | null>(null);
  const [captures, setCaptures] = useState(0);
  const [beforeScore, setBeforeScore] = useState<ShotScore | null>(null);
  const [beforeScored, setBeforeScored] = useState(false);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [readingLine, setReadingLine] = useState(0);
  /** Paused by a spoken command; the touch "Resume" undoes it. */
  const [paused, setPaused] = useState(false);
  /** true from the "Start talking" tap until the conversation is ended. */
  const [talking, setTalking] = useState(false);
  const talkingRef = useRef(false);
  const talkAvailable = talk !== null && talk.state.configured === true;

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
    if (demo) {
      // Scoring the drawing would load the tracking model from the network. The demo stays offline:
      // the "before" side is shown as not measured, and the review is the bundled sample.
      setBeforeScore(null);
      setBeforeScored(true);
      setReview({ ...sampleReview(lang), mock: true });
      return;
    }
    let scored: ShotScore | null = null;
    try {
      const aim = targetRef.current;
      scored = await scoreStill(beforeImage, chosen, mode, aim ? { points: aim.points, box: aim.box } : undefined);
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

  /** Ends the conversation. After a capture, the director first lets the agent hear the result. */
  const endTalk = (afterCapture = false) => {
    if (!talkingRef.current || !talk) return;
    talkingRef.current = false;
    setTalking(false);
    void talk.director.end(afterCapture ? { afterCapture: true } : undefined);
  };

  const handleCapture = (captured: CapturedShot) => {
    // A photo that arrives after the user has left coaching belongs to nothing on screen.
    if (step !== "coach") return;
    endTalk(true);
    setPaused(false);
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
    engine: demo ? "sim" : "auto",
    target,
    // The conversation's speech object is stable; it is only handed over while the conversation runs.
    speech: demo ? deviceSpeech : talking && talk ? talk.speech : undefined,
    paused,
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
    endTalk();
    stopCamera();
    setPicture(null);
    setProblem(null);
    setStep("intro");
  };

  const currentFrame = async (): Promise<string> =>
    live ? (await grabFrame(live, { maxSide: 1024, mirrored, quality: 0.85 })).dataUrl : shrinkImage(picture ?? "", 1024);

  const choose = (chosen: ShotIdea) => {
    // Stop the previous idea's countdown or capture before anything changes.
    session.cancelPendingCapture();
    unlockAudio();
    setPaused(false);
    runRef.current += 1;
    setTarget(undefined);
    targetRef.current = undefined;
    const preview = previews.previews[chosen.id];
    if (preview?.status === "ready") {
      const run = runRef.current;
      const frameAspect = live?.videoWidth ? Promise.resolve(live.videoWidth / live.videoHeight) : before ? pictureAspect(before) : Promise.resolve(null);
      void frameAspect.then((aspect) => targetFromPreview(preview.image, aspect)).then((found) => {
        if (!found || runRef.current !== run) return;
        targetRef.current = found;
        setTarget(found);
      });
    }
    setIdea(chosen);
    setShot(null);
    setBeforeScore(null);
    setBeforeScored(false);
    setReview(null);
    setReviewing(false);
    setStep("coach");
  };

  /** Demo: the drawing stands in for the camera. Nothing is requested from the browser. */
  const startDemo = () => {
    unlockAudio();
    setProblem(null);
    setPicture(DEMO_SCENE);
    setStep("camera");
  };

  const readScene = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setProblem(null);
    try {
      if (demo) {
        // The bundled sample plan, never a reading: the drawing does not leave the page.
        setBefore(await shrinkImage(DEMO_SCENE, 1024));
        setPlan(SAMPLE_PLAN_PERSON);
        setMock(true);
        previews.clear();
        setStep("ideas");
        return;
      }
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
      // Previews only for a real reading of this scene, never for sample ideas.
      if (answer.mock) previews.clear();
      else void previews.request(image, answer.plan.ideas, lang);
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

  /* ------------------------------------------------- voice conversation */

  const startTalk = () => {
    if (!talk || talkingRef.current) return;
    unlockAudio();
    talkingRef.current = true;
    setTalking(true);
    talk.director.setOutputEnabled(voice);
    void talk.director.start(lang);
  };

  const cameraReady = live !== null && live.readyState >= 2 && live.videoWidth > 0;
  const context: Omit<VoiceContext, "updatedAt"> = {
    lang,
    phase: step,
    ideas: (step === "ideas" || step === "coach") && plan && !recipe ? plan.ideas.map(({ id, title }) => ({ id, title })) : [],
    selectedIdeaId: idea?.id ?? null,
    // Only facts from a real reading of this scene; sample data says nothing about it.
    scene: plan && !mock ? plan.scene : null,
    coachPhase: coaching ? session.phase : null,
    instruction: coaching ? session.instruction : null,
    personTracked: coaching && session.personVisible,
    paused,
    cameraReady,
  };
  const contextKey = JSON.stringify(context);

  /** Spoken commands. Same paths as the touch controls; the abort signal is checked before anything changes. */
  const handlers: VoiceActions = {
    selectIdea(ideaId, signal) {
      if (step !== "ideas" && step !== "coach") return { ok: false, reason: "wrong_phase" };
      const chosen = recipe ? undefined : plan?.ideas.find((item) => item.id === ideaId);
      if (!chosen) return { ok: false, reason: plan && !recipe ? "unknown_idea" : "wrong_phase" };
      session.cancelPendingCapture();
      if (signal.aborted) return { ok: false, reason: "stale" };
      choose(chosen);
      return { ok: true, outcome: "idea_selected" };
    },
    setCoachingPaused(pause, signal) {
      if (!coaching) return { ok: false, reason: "wrong_phase" };
      session.cancelPendingCapture();
      if (signal.aborted) return { ok: false, reason: "stale" };
      setPaused(pause);
      return { ok: true, outcome: pause ? "paused" : "resumed" };
    },
    requestCapture(signal) {
      if (!coaching) return { ok: false, reason: "wrong_phase" };
      if (paused) return { ok: false, reason: "paused" };
      if (signal.aborted) return { ok: false, reason: "stale" };
      return session.requestCapture(signal);
    },
  };

  const director = talk?.director ?? null;
  const register = talk?.register;
  useEffect(() => {
    register?.(handlers);
  });

  // The output switch governs the conversation's voice as well as the coach's own.
  useEffect(() => {
    director?.setOutputEnabled(voice);
  }, [director, voice]);

  // Tell the conversation what is on screen whenever it changes, and refresh it every two seconds.
  useEffect(() => {
    if (!talking || !director) return;
    const send = () => director.updateContext({ ...context, updatedAt: Date.now() });
    send();
    const id = window.setInterval(send, CONTEXT_EVERY_MS);
    return () => window.clearInterval(id);
    // `context` is tracked through contextKey: a new object every render, the same content most of the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talking, director, contextKey]);

  // The agent's language is chosen at start: a language change restarts the conversation.
  const startedLang = useRef(lang);
  useEffect(() => {
    if (!director || !talkingRef.current || startedLang.current === lang) {
      startedLang.current = lang;
      return;
    }
    startedLang.current = lang;
    void director.end().then(() => {
      if (talkingRef.current) void director.start(lang);
    });
  }, [lang, director]);

  const voiceControl = talkAvailable && talk && (
    <VoiceControl
      lang={lang}
      state={talk.state}
      talking={talking}
      onStart={startTalk}
      onStop={() => endTalk()}
      onToggleMic={() => talk.director.setMicMuted(!talk.state.micMuted)}
    />
  );

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
        <img src={picture} alt={demo ? t("demoSceneAlt", lang) : ""} className="absolute inset-0 h-full w-full object-cover" />
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
              <button
                type="button"
                className={pill}
                onClick={() => {
                  endTalk();
                  onExit();
                }}
              >
                {t("backToRecipe", lang)}
              </button>
            ) : (
              <Link href="/" className={pill}>
                {t("home", lang)}
              </Link>
            )}
            <span className="flex items-center gap-2">
              {demo && <span className={demoTag}>{t("demoBadge", lang)}</span>}
              <LangToggle />
            </span>
          </div>
          {demo ? (
            <div>
              <h1 className="text-5xl font-semibold tracking-tight">{t("demoTitle", lang)}</h1>
              <p className="mt-3 text-lg leading-snug text-neutral-300">{t("demoIntro", lang)}</p>
            </div>
          ) : recipe ? (
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
            {demo ? (
              <>
                <button type="button" className={primary} onClick={startDemo}>
                  {t("demoStart", lang)}
                </button>
                <Link href="/shoot" className={secondary}>
                  {t("tryReal", lang)}
                </Link>
              </>
            ) : (
              <>
                <button type="button" className={primary} onClick={() => startCamera(facing)}>
                  {t("openCamera", lang)}
                </button>
                <label className={`${secondary} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white`}>
                  {t("usePicture", lang)}
                  <input type="file" accept="image/*" className="sr-only" onChange={(event) => choosePicture(event.currentTarget)} />
                </label>
                {problem && DEMO_HINT.includes(problem) && (
                  <Link href="/demo" className={demoLink}>
                    {t("watchDemo", lang)}
                  </Link>
                )}
                <p className="text-center text-xs text-neutral-400">
                  {t(recipe ? (recipe.idea.subject ? "privacyRecipe" : "privacyRecipeGuided") : "privacy", lang)}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {step === "camera" && (
        <section className="absolute inset-0 flex flex-col justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={pill} onClick={leaveSource}>
              {t("back", lang)}
            </button>
            {demo && <span className={demoTag}>{t("demoBadge", lang)}</span>}
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
            {voiceControl}
            {problemNote}
            {recipe && (
              <div className={overCamera}>
                <p className="text-xs font-medium uppercase tracking-wide text-green-300">{t("recreating", lang)}</p>
                <p className="font-semibold leading-tight">{recipe.title}</p>
                <p className="mt-1 text-sm leading-snug text-neutral-200">{recipe.idea.photographer.say}</p>
              </div>
            )}
            <button type="button" className={primary} onClick={recipe ? startRecipe : readScene}>
              {t(recipe ? "startRecipe" : demo ? "demoRead" : "readScene", lang)}
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
          {voiceControl && <div className="px-4">{voiceControl}</div>}
          <div className="mt-auto">
            <div className="flex items-center justify-between gap-2 px-4 pb-3">
              <h2 className="text-2xl font-semibold">{t("pickShot", lang)}</h2>
              <span className="flex items-center gap-2">
                {demo ? <span className={demoTag}>{t("demoBadge", lang)}</span> : mock && <span className={sampleTag}>{t("sample", lang)}</span>}
                <button type="button" className={pill} onClick={() => setStep("camera")}>
                  {t("back", lang)}
                </button>
              </span>
            </div>
            {mock && (
              <div className="grid gap-1 px-4 pb-3">
                <p className="text-sm leading-snug text-amber-200">{t(demo ? "demoIdeasNote" : "sampleIdeasNote", lang)}</p>
                {!demo && (
                  <Link href="/demo" className="text-sm text-neutral-300 underline underline-offset-4">
                    {t("watchDemo", lang)}
                  </Link>
                )}
              </div>
            )}
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
              {plan.ideas.map((item) => (
                <IdeaCard key={item.id} idea={item} lang={lang} onUse={() => choose(item)} preview={previews.previews[item.id]} />
              ))}
            </div>
            {Object.keys(previews.previews).length > 0 && <p className="px-4 pt-1 text-xs leading-snug text-neutral-300">{t("previewsNote", lang)}</p>}
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
              {demo && <span className={demoTag}>{t("demoBadge", lang)}</span>}
            </div>
            <ScoreRing score={session.score} />
          </div>

          {session.countdown !== null && (
            <p className="pointer-events-none absolute inset-0 grid place-items-center text-[10rem] font-bold leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              {session.countdown}
            </p>
          )}

          <div className="grid gap-3">
            {voiceControl}
            {paused && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/75 px-4 py-2 backdrop-blur" role="status">
                <span className="font-semibold">{t("paused", lang)}</span>
                <button type="button" className={pill} onClick={() => setPaused(false)}>
                  {t("resume", lang)}
                </button>
              </div>
            )}
            {demo && <p className="rounded-xl bg-black/70 px-3 py-2 text-center text-sm text-amber-200">{t("demoCoachNote", lang)}</p>}
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
          {demo && <p className="mb-3"><span className={demoTag}>{t("demoBadge", lang)}</span></p>}
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
              {review?.mock && <span className={sampleTag}>{t(demo ? "demoReviewNote" : "sampleReview", lang)}</span>}
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

          <p className="mt-3 text-center text-xs text-neutral-400">{t(demo ? "demoPhotoNote" : "realPhoto", lang)}</p>

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
              {t(demo ? "demoAgain" : recipe ? "shootAgain" : "newScene", lang)}
            </button>
            {demo && (
              <Link href="/shoot" className={secondary}>
                {t("tryReal", lang)}
              </Link>
            )}
            {recipe && onExit && (
              <button
                type="button"
                className={secondary}
                onClick={() => {
                  endTalk();
                  onExit();
                }}
              >
                {t("backToRecipe", lang)}
              </button>
            )}
          </div>

          {demo ? (
            <div className="mt-6 grid gap-2 text-sm leading-snug text-neutral-300" data-testid="demo-disabled">
              <p className={card}>{t("demoNoRecipe", lang)}</p>
              <p className={card}>{t("demoNoFeedback", lang)}</p>
            </div>
          ) : (
            <>
              {!recipe && (
                <div className="mt-6">
                  <RecipePublisher key={captures} idea={idea} sample={mock} lang={lang} />
                </div>
              )}

              <div className="mt-8">
                <FeedbackForm key={captures} lang={lang} round={round} />
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
