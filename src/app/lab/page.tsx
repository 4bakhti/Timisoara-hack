import Link from "next/link";
import { BONES, POSE_TEMPLATES, headRadiusFor } from "@/vision";
import type { PoseTemplate } from "@/lib/contracts";

export const metadata = { title: "Lab: pose library" };

/** Internal page: shows every pose template so it can be checked by eye. */
export default function LabPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Pose library</h1>
      <p className="mt-1 text-sm opacity-70">
        {POSE_TEMPLATES.length} templates. Drawn as the camera sees them: the person&apos;s left is on the
        right.
      </p>
      <p className="mt-3 flex gap-4 text-sm underline">
        <Link href="/lab/live">Live camera test</Link>
        <Link href="/lab/try">Try the coach on a picture</Link>
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {POSE_TEMPLATES.map((t) => (
          <li key={t.id} className="rounded-xl border border-white/15 bg-neutral-900 p-3 text-neutral-100">
            <PoseFigure template={t} />
            <p className="mt-2 text-sm font-medium">{t.name.en}</p>
            <p className="text-xs opacity-60">{t.id}</p>
            <p className="mt-1 text-xs opacity-80">{t.cue.en}</p>
            <p className="mt-1 text-xs opacity-50">{t.tags.join(" · ")}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

function PoseFigure({ template }: { template: PoseTemplate }) {
  const p = template.points;
  const head = headRadiusFor(p);
  return (
    <svg viewBox="-0.1 -0.03 1.2 1.06" className="aspect-[3/4] w-full" role="img" aria-label={template.name.en}>
      <g stroke="currentColor" strokeWidth={0.03} strokeLinecap="round" fill="none">
        {BONES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={p[a][0]} y1={p[a][1]} x2={p[b][0]} y2={p[b][1]} />
        ))}
        <circle cx={p.nose[0]} cy={p.nose[1]} r={head} />
      </g>
      <circle cx={p.lWrist[0]} cy={p.lWrist[1]} r={0.02} fill="#4ade80" />
      <circle cx={p.rWrist[0]} cy={p.rWrist[1]} r={0.02} fill="#60a5fa" />
    </svg>
  );
}
