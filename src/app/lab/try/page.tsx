"use client";

/**
 * Internal page: runs the real coach on a single picture, so the tracking,
 * matching and scoring can be checked without a phone or a person on camera.
 * Pictures chosen here stay in the browser; nothing is uploaded.
 */
import { useMemo, useState } from "react";
import { useCoachSession, type CapturedShot } from "@/coach";
import type { CoachMode, ShotIdea, ShotScore } from "@/lib/contracts";
import { POSE_TEMPLATES, scoreStill } from "@/vision";

const BOX = { x: 0.2, y: 0.06, w: 0.6, h: 0.9 };

function ideaFor(poseTemplateId: string): ShotIdea {
  return {
    id: `lab-${poseTemplateId}`,
    title: "Lab",
    style: "portrait",
    why: "Lab check.",
    photographer: { say: "Hold steady.", move: "stay", height: "eye", orientation: "portrait" },
    subject: { say: "Match the outline.", poseTemplateId },
    framing: { subjectBox: BOX, levelDeg: 0 },
    usesFromScene: ["lab", "picture"],
  };
}

export default function LabTryPage() {
  const [poseId, setPoseId] = useState(POSE_TEMPLATES[0].id);
  const [mode, setMode] = useState<CoachMode>("solo");
  const [src, setSrc] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [aspect, setAspect] = useState(3 / 4);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [shot, setShot] = useState<CapturedShot | null>(null);
  const [still, setStill] = useState<ShotScore | string | null>(null);

  const idea = useMemo(() => ideaFor(poseId), [poseId]);
  const session = useCoachSession({
    video: null,
    still: src,
    overlay: canvas,
    idea,
    mode,
    lang: "en",
    voice: false,
    onCapture: setShot,
  });

  const show = (next: string) => {
    setShot(null);
    setStill(null);
    setSrc(next);
  };

  const runStillScore = async () => {
    if (!src) return;
    setStill("scoring…");
    try {
      setStill(await scoreStill(src, idea, mode));
    } catch (err) {
      setStill(err instanceof Error ? err.message : "failed");
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 p-6 md:grid-cols-[minmax(0,360px)_1fr]">
      <section>
        <h1 className="text-2xl font-semibold">Try the coach on a picture</h1>
        <div className="mt-4 grid gap-3 text-sm">
          <label className="grid gap-1">
            Picture from this device
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) show(URL.createObjectURL(file));
              }}
            />
          </label>
          <label className="grid gap-1">
            Or a picture address (the site must allow cross-origin use)
            <span className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border px-2 py-1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="https://…"
                aria-label="Picture address"
              />
              <button className="rounded border px-3 py-1" onClick={() => address && show(address)}>
                Load
              </button>
            </span>
          </label>
          <label className="grid gap-1">
            Pose
            <select className="rounded border px-2 py-1" value={poseId} onChange={(e) => setPoseId(e.target.value)}>
              {POSE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name.en}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Mode
            <select className="rounded border px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as CoachMode)}>
              <option value="solo">solo</option>
              <option value="friend">friend</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button className="rounded border px-3 py-1" onClick={() => { setShot(null); session.restart(); }}>
              Restart
            </button>
            <button className="rounded border px-3 py-1" onClick={session.captureNow}>
              Capture now
            </button>
            <button className="rounded border px-3 py-1" onClick={runStillScore}>
              Score as a still
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="lab-readout">
          <dt className="opacity-60">phase</dt>
          <dd data-testid="phase">{session.phase}</dd>
          <dt className="opacity-60">score</dt>
          <dd data-testid="score">{session.score}</dd>
          <dt className="opacity-60">parts</dt>
          <dd data-testid="parts">
            pose {String(session.parts.pose)} · framing {String(session.parts.framing)} · level {String(session.parts.level)}
          </dd>
          <dt className="opacity-60">instruction</dt>
          <dd data-testid="instruction">{session.instruction ? `${session.instruction.id}: ${session.instruction.text}` : "—"}</dd>
          <dt className="opacity-60">person</dt>
          <dd data-testid="person">{String(session.personVisible)}</dd>
          <dt className="opacity-60">fps</dt>
          <dd>{session.fps}</dd>
          <dt className="opacity-60">model · outline</dt>
          <dd data-testid="debug">
            {session.debug?.model ?? "–"} · {session.debug?.silhouette ? `on (${session.debug?.outlineCoverage ?? "?"}% of frame)` : "off"}
          </dd>
          <dt className="opacity-60">error</dt>
          <dd data-testid="error">{session.error ?? "—"}</dd>
          <dt className="opacity-60">captured</dt>
          <dd data-testid="captured">{shot ? JSON.stringify(shot.score) : "—"}</dd>
          <dt className="opacity-60">still score</dt>
          <dd data-testid="still">{still === null ? "—" : typeof still === "string" ? still : JSON.stringify(still)}</dd>
        </dl>
      </section>

      <section>
        <div className="relative w-full max-w-md overflow-hidden rounded-xl bg-neutral-900" style={{ aspectRatio: aspect }}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary local or remote test pictures
            <img
              src={src}
              alt="Picture under test"
              className="absolute inset-0 h-full w-full object-cover"
              onLoad={(e) => setAspect(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
            />
          ) : (
            <p className="absolute inset-0 grid place-items-center text-sm text-neutral-400">Choose a picture</p>
          )}
          <canvas ref={setCanvas} className="absolute inset-0 h-full w-full" />
        </div>
      </section>
    </main>
  );
}
