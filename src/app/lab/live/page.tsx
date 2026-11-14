"use client";

/**
 * Internal page: the coach on the live camera, with the pose picked by hand.
 * Use it on a phone to test tracking, voice and capture without the full flow.
 * Nothing is uploaded: tracking runs on the device and the photo stays in the page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { unlockAudio, useCoachSession, type CapturedShot } from "@/coach";
import type { CoachMode, Lang, ShotIdea } from "@/lib/contracts";
import { POSE_TEMPLATES, requestMotionPermission } from "@/vision";

type Facing = "environment" | "user";

function ideaFor(poseTemplateId: string): ShotIdea {
  return {
    id: `live-${poseTemplateId}`,
    title: "Lab",
    style: "portrait",
    why: "Lab check.",
    photographer: { say: "Hold steady.", move: "stay", height: "eye", orientation: "portrait" },
    subject: { say: "Match the outline.", poseTemplateId },
    framing: { subjectBox: { x: 0.22, y: 0.1, w: 0.56, h: 0.84 }, levelDeg: 0 },
    usesFromScene: ["lab", "camera"],
  };
}

export default function LabLivePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState<HTMLVideoElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [poseId, setPoseId] = useState(POSE_TEMPLATES[0].id);
  const [mode, setMode] = useState<CoachMode>("solo");
  const [lang, setLang] = useState<Lang>("en");
  const [voice, setVoice] = useState(true);
  const [shot, setShot] = useState<CapturedShot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const idea = useMemo(() => ideaFor(poseId), [poseId]);
  const mirrored = facing === "user";

  const session = useCoachSession({
    video: live,
    overlay: canvas,
    idea,
    mode,
    lang,
    mirrored,
    voice,
    paused: shot !== null,
    onCapture: setShot,
  });

  useEffect(() => {
    const ref = streamRef;
    return () => ref.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const start = async (wanted: Facing) => {
    setProblem(null);
    unlockAudio();
    void requestMotionPermission();
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setLive(null);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot open the camera here (HTTPS is required).");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: wanted }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setFacing(wanted);
      setShot(null);
      setLive(video);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The camera could not be opened.");
    }
  };

  const flip = mirrored ? "-scale-x-100" : "";

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-lg flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${flip}`} />
        <canvas ref={setCanvas} className={`absolute inset-0 h-full w-full ${flip}`} />

        {shot && (
          // eslint-disable-next-line @next/next/no-img-element -- the captured frame, a data URL
          <img src={shot.dataUrl} alt="Captured shot" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {!live && !shot && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <button className="rounded-full bg-white px-6 py-3 font-medium text-black" onClick={() => start(facing)}>
                Start camera
              </button>
              {problem && <p className="mt-3 text-sm text-amber-300">{problem}</p>}
            </div>
          </div>
        )}

        {session.countdown !== null && !shot && (
          <p className="absolute inset-0 grid place-items-center text-9xl font-bold drop-shadow-lg" aria-live="assertive">
            {session.countdown}
          </p>
        )}

        {live && !shot && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 text-sm">
            <span data-testid="phase">{session.phase}</span>
            <span className="rounded-full bg-black/60 px-3 py-1 text-lg font-semibold tabular-nums" data-testid="score">
              {session.score}
            </span>
            <span className="opacity-70">{session.fps} fps</span>
          </div>
        )}
      </div>

      <div className="grid gap-2 p-3 text-sm">
        <p className="min-h-12 text-center text-lg font-medium" aria-live="polite" data-testid="instruction">
          {shot
            ? `Score ${shot.score.total} · pose ${String(shot.score.pose)} · framing ${String(shot.score.framing)} · crop ${String(shot.score.crop)} · light ${String(shot.score.light)} · level ${String(shot.score.level)}`
            : session.error === "tracker_unavailable"
              ? "Live tracking is not available on this device. Line up with the outline and press the shutter."
              : (session.instruction?.text ?? (live ? "…" : "Start the camera to begin."))}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select className="rounded bg-neutral-800 px-2 py-2" value={poseId} onChange={(e) => setPoseId(e.target.value)} aria-label="Pose">
            {POSE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name[lang]}
              </option>
            ))}
          </select>
          <select className="rounded bg-neutral-800 px-2 py-2" value={mode} onChange={(e) => setMode(e.target.value as CoachMode)} aria-label="Mode">
            <option value="solo">Solo (phone propped up)</option>
            <option value="friend">With a friend</option>
          </select>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button className="rounded bg-neutral-800 py-2" onClick={() => setLang(lang === "en" ? "ro" : "en")}>
            {lang.toUpperCase()}
          </button>
          <button className="rounded bg-neutral-800 py-2" onClick={() => setVoice(!voice)}>
            {voice ? "Voice on" : "Voice off"}
          </button>
          <button className="rounded bg-neutral-800 py-2" onClick={() => start(mirrored ? "environment" : "user")} disabled={!live && !shot}>
            Flip
          </button>
          {shot ? (
            <button className="rounded bg-emerald-400 py-2 font-semibold text-black" onClick={() => setShot(null)}>
              Again
            </button>
          ) : (
            <button className="rounded bg-white py-2 font-semibold text-black" onClick={session.captureNow} disabled={!live}>
              Shutter
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
