"use client";

/**
 * The pose camera: a plain camera with one thing added, a pose to match.
 *
 * It opens straight onto the camera. A moment after it starts, one small frame
 * goes to the AI, which picks the poses that suit this person here (someone
 * sitting stays sitting); until it answers, the device's own order is used.
 * The pose is drawn on the person, the limb to move turns red, everything turns
 * green when it matches, and the photo takes itself. No text: swipe or tap the
 * little figures to change pose; the shutter works any time; photos stay on the
 * phone until shared.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { unlockAudio, useCoachSession, type CapturedShot } from "@/coach";
import { t, tf, type StringKey } from "@/i18n/strings";
import { api } from "@/lib/api";
import type { Box, CoachMode, Lang, ShotIdea } from "@/lib/contracts";
import { useLang } from "@/state/lang";
import { BONES, getPoseTemplate, grabFrame, headRadiusFor } from "@/vision";

type Facing = "environment" | "user";
type Problem = "cameraDenied" | "cameraMissing" | "insecure";

/** Until the AI answers: poses that work close up (front camera) or at full length (back camera). */
const CLOSE_POSES = ["arms-crossed", "thinker", "hand-in-hair", "wave", "hold-something", "three-quarter"];
const FAR_POSES = ["relaxed-stand", "hand-on-hip", "three-quarter", "hands-in-pockets", "arms-crossed", "wave"];
/** Where the person goes: close shots are cut at the bottom edge, full-length ones keep a margin. */
const CLOSE_BOX: Box = { x: 0.12, y: 0.1, w: 0.76, h: 0.9 };
const FAR_BOX: Box = { x: 0.25, y: 0.06, w: 0.5, h: 0.88 };
/** Give the person a moment to get into the picture before the AI looks. */
const SUGGEST_AFTER_MS = 1200;
const SWIPE_PX = 60;

function ideaFor(poseId: string, close: boolean, run: number): ShotIdea {
  return {
    id: `pose-${poseId}-${run}`,
    title: "",
    style: "portrait",
    why: "",
    photographer: { say: "", move: "stay", height: "eye", orientation: "portrait" },
    subject: { say: "", poseTemplateId: poseId },
    framing: { subjectBox: close ? CLOSE_BOX : FAR_BOX, levelDeg: 0 },
    usesFromScene: [],
  };
}

export function PoseCamera() {
  const lang = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Bumped for every camera start, so a slow start that was replaced cannot take over. */
  const startRef = useRef(0);
  /** Bumped for every suggestion, so only the latest answer is used. */
  const suggestRef = useRef(0);
  const swipeFrom = useRef<number | null>(null);

  const [live, setLive] = useState<HTMLVideoElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [poses, setPoses] = useState<string[]>(FAR_POSES);
  const [index, setIndex] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [photos, setPhotos] = useState<CapturedShot[]>([]);
  const [viewing, setViewing] = useState(false);
  const [voice, setVoice] = useState(false);
  const [flash, setFlash] = useState(false);
  const [run, setRun] = useState(0);

  const front = facing === "user";
  const poseId = poses[index] ?? poses[0];
  const close = front || !getPoseTemplate(poseId).tags.includes("full-body");
  const idea = useMemo(() => ideaFor(poseId, close, run), [poseId, close, run]);
  const mode: CoachMode = front ? "solo" : "friend";

  /** Shows one frame to the AI and puts its poses first; the device's order stays behind them. */
  const suggest = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const ask = ++suggestRef.current;
    setSuggesting(true);
    try {
      const frame = await grabFrame(video, { maxSide: 512, quality: 0.7 });
      const picked = await api.pose(frame.dataUrl);
      if (suggestRef.current !== ask || !picked?.length) return;
      const fallback = video.dataset.facing === "user" ? CLOSE_POSES : FAR_POSES;
      setPoses([...picked, ...fallback.filter((id) => !picked.includes(id))]);
      setIndex(0);
    } catch {
      // Keep the device's own order.
    } finally {
      if (suggestRef.current === ask) setSuggesting(false);
    }
  }, []);

  const start = useCallback(
    async (wanted: Facing) => {
      const token = ++startRef.current;
      setProblem(null);
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setProblem("insecure");
        return;
      }
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setLive(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: wanted }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (startRef.current !== token) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.dataset.facing = wanted;
        await video.play();
        if (startRef.current !== token) return;
        setFacing(wanted);
        setPoses(wanted === "user" ? CLOSE_POSES : FAR_POSES);
        setIndex(0);
        setLive(video);
        void navigator.wakeLock?.request("screen").catch(() => undefined);
        window.setTimeout(() => {
          if (startRef.current === token) void suggest();
        }, SUGGEST_AFTER_MS);
      } catch (err) {
        if (startRef.current !== token) return;
        const name = err instanceof DOMException ? err.name : "";
        setProblem(name === "NotAllowedError" || name === "SecurityError" ? "cameraDenied" : "cameraMissing");
      }
    },
    [suggest],
  );

  useEffect(() => {
    // Opens the camera right away, like a camera app (scheduled, so the effect itself sets no state).
    const opening = window.setTimeout(() => void start("environment"), 0);
    return () => {
      window.clearTimeout(opening);
      startRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [start]);

  const onCapture = useCallback((shot: CapturedShot) => {
    setPhotos((list) => [shot, ...list].slice(0, 30));
    setFlash(true);
    window.setTimeout(() => setFlash(false), 160);
    // A new session for the next photo, once the flash is over.
    window.setTimeout(() => setRun((n) => n + 1), 900);
  }, []);

  const session = useCoachSession({
    video: live,
    overlay: canvas,
    idea,
    mode,
    lang,
    mirrored: front,
    voice,
    paused: viewing,
    onCapture,
  });

  const step = (by: number) => setIndex((i) => (i + by + poses.length) % poses.length);
  const onPointerDown = (event: PointerEvent) => {
    swipeFrom.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null || Math.abs(event.clientX - from) < SWIPE_PX) return;
    step(event.clientX < from ? 1 : -1);
  };

  const matched = session.phase === "holding" || session.phase === "countdown";
  const last = photos[0];
  const flip = front ? "-scale-x-100" : "";

  return (
    <main
      className="fixed inset-0 touch-pan-y overflow-hidden bg-black text-white select-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${flip}`} />
      <canvas ref={setCanvas} className={`pointer-events-none absolute inset-0 h-full w-full ${flip}`} />
      {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex gap-2">
          <IconButton label={t("cameraSuggest", lang)} onClick={() => void suggest()}>
            <SparkleIcon spinning={suggesting} />
          </IconButton>
          <IconButton
            label={t("cameraVoice", lang)}
            pressed={voice}
            onClick={() => {
              unlockAudio();
              setVoice((on) => !on);
            }}
          >
            {voice ? <SpeakerIcon /> : <SpeakerOffIcon />}
          </IconButton>
        </div>
        {live && <MatchRing score={session.score} matched={matched} />}
      </div>

      {session.countdown !== null && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-9xl font-bold drop-shadow-lg" aria-live="assertive">
          {session.countdown}
        </p>
      )}

      <div className="absolute inset-x-0 bottom-0 grid gap-4 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pt-10 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-center gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={t("cameraPoses", lang)}>
          {poses.map((id, i) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={i === index}
              aria-label={tf("cameraPose", lang, { n: i + 1, total: poses.length })}
              onClick={() => setIndex(i)}
              className={`grid size-12 shrink-0 place-items-center rounded-full transition active:scale-95 ${
                i === index ? "bg-white text-black" : "bg-black/45 text-white ring-1 ring-white/25"
              }`}
            >
              <PoseGlyph id={id} />
            </button>
          ))}
        </div>

        <div className="mx-auto flex w-full max-w-sm items-center justify-between">
          <button
            type="button"
            aria-label={t("cameraLastPhoto", lang)}
            disabled={!last}
            onClick={() => setViewing(true)}
            className="size-14 overflow-hidden rounded-xl bg-white/10 ring-2 ring-white/70 disabled:opacity-40"
          >
            {last && (
              // eslint-disable-next-line @next/next/no-img-element -- a captured frame, a data URL
              <img src={last.dataUrl} alt="" className="h-full w-full object-cover" />
            )}
          </button>
          <button
            type="button"
            aria-label={t("cameraShutter", lang)}
            disabled={!live}
            onClick={() => session.captureNow()}
            className={`size-20 rounded-full border-[5px] transition active:scale-95 disabled:opacity-50 ${
              matched ? "border-green-400 bg-green-400/90" : "border-white bg-white/90"
            }`}
          />
          <IconButton label={t("cameraFlip", lang)} large onClick={() => void start(front ? "environment" : "user")}>
            <FlipIcon />
          </IconButton>
        </div>
      </div>

      {problem && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 p-8 text-center">
          <div className="grid max-w-xs justify-items-center gap-4">
            <CameraIcon />
            <p className="text-sm leading-snug text-neutral-300">{t(problem as StringKey, lang)}</p>
            <button type="button" className="rounded-full bg-white px-6 py-3 font-medium text-black" onClick={() => void start(facing)}>
              {t("retry", lang)}
            </button>
          </div>
        </div>
      )}

      {viewing && last && <PhotoViewer shot={last} lang={lang} onClose={() => setViewing(false)} />}
    </main>
  );
}

/* ------------------------------------------------------------------ parts */

function IconButton({
  label,
  onClick,
  pressed,
  large = false,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-full bg-black/45 backdrop-blur active:scale-95 ${large ? "size-14" : "size-11"}`}
    >
      {children}
    </button>
  );
}

/** A pose as a little stick figure, drawn from the template itself. */
function PoseGlyph({ id }: { id: string }) {
  const { points } = getPoseTemplate(id);
  const x = (v: number) => 12 + (v - 0.5) * 21;
  const y = (v: number) => 1.5 + v * 21;
  return (
    <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true">
      <g stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" fill="none">
        {BONES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={x(points[a][0])} y1={y(points[a][1])} x2={x(points[b][0])} y2={y(points[b][1])} />
        ))}
        <circle cx={x(points.nose[0])} cy={y(points.nose[1])} r={Math.max(1.6, headRadiusFor(points) * 21)} />
      </g>
    </svg>
  );
}

/** How close the pose is: the ring fills up, and turns green once it matches. */
function MatchRing({ score, matched }: { score: number; matched: boolean }) {
  const r = 18;
  const length = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-12 drop-shadow" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke={matched ? "#4ade80" : "#ffffff"}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * length} ${length}`}
        transform="rotate(-90 22 22)"
        style={{ transition: "stroke-dasharray 200ms linear" }}
      />
    </svg>
  );
}

function PhotoViewer({ shot, lang, onClose }: { shot: CapturedShot; lang: Lang; onClose: () => void }) {
  const share = async () => {
    const file = new File([shot.blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        // The person closed the share sheet.
      }
      return;
    }
    const url = URL.createObjectURL(shot.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="absolute inset-0 z-20 bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element -- a captured frame, a data URL */}
      <img src={shot.dataUrl} alt="" className="h-full w-full object-contain" />
      <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <IconButton label={t("cameraClose", lang)} onClick={onClose}>
          <CloseIcon />
        </IconButton>
        <IconButton label={t("cameraShare", lang)} onClick={() => void share()}>
          <ShareIcon />
        </IconButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function SparkleIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 ${spinning ? "animate-spin" : ""}`} aria-hidden="true">
      <path {...stroke} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path {...stroke} d="M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path {...stroke} d="M4 9v6h4l5 4V5L8 9H4zM17 10l4 4M21 10l-4 4" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
      <path {...stroke} d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M20 4v4h-4M4 20v-4h4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path {...stroke} d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path {...stroke} d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-12 text-neutral-300" aria-hidden="true">
      <path {...stroke} d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    </svg>
  );
}
