import type { Lang, ShotIdea } from "@/lib/contracts";
import { t } from "@/i18n/strings";
import { BONES, getPoseTemplate, headRadiusFor } from "@/vision";

/** A small drawing of the frame: where the subject goes, and the pose if there is one. */
export function FramingDiagram({ idea, className }: { idea: ShotIdea; className?: string }) {
  const portrait = idea.photographer.orientation === "portrait";
  // A wide frame is sized by its width, so it never squeezes the text beside it.
  const size = className ?? (portrait ? "h-28 w-auto" : "h-auto w-28");
  const w = portrait ? 75 : 100;
  const h = portrait ? 100 : 75;
  const box = idea.framing.subjectBox;
  const template = idea.subject ? getPoseTemplate(idea.subject.poseTemplateId) : null;
  const figureHeight = box.h * h;
  const px = (x: number) => (box.x + box.w / 2) * w + (x - 0.5) * figureHeight;
  const py = (y: number) => box.y * h + y * figureHeight;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`${size} shrink-0 self-start rounded-md bg-neutral-800`} aria-hidden="true">
      <g stroke="rgba(255,255,255,0.14)" strokeWidth="0.6">
        <line x1={w / 3} y1="0" x2={w / 3} y2={h} />
        <line x1={(2 * w) / 3} y1="0" x2={(2 * w) / 3} y2={h} />
        <line x1="0" y1={h / 3} x2={w} y2={h / 3} />
        <line x1="0" y1={(2 * h) / 3} x2={w} y2={(2 * h) / 3} />
      </g>
      <rect
        x={box.x * w}
        y={box.y * h}
        width={box.w * w}
        height={box.h * h}
        fill="rgba(74,222,128,0.1)"
        stroke="#4ade80"
        strokeWidth="1"
        strokeDasharray="3 2"
        rx="2"
      />
      {template && (
        <g stroke="#f5f5f5" strokeWidth={Math.max(1.4, figureHeight * 0.03)} strokeLinecap="round" fill="none">
          {BONES.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={px(template.points[a][0])}
              y1={py(template.points[a][1])}
              x2={px(template.points[b][0])}
              y2={py(template.points[b][1])}
            />
          ))}
          <circle cx={px(template.points.nose[0])} cy={py(template.points.nose[1])} r={headRadiusFor(template.points) * figureHeight} />
        </g>
      )}
    </svg>
  );
}

export function IdeaCard({ idea, lang, onUse }: { idea: ShotIdea; lang: Lang; onUse: () => void }) {
  return (
    <article className="flex w-[84%] max-w-sm shrink-0 snap-center flex-col gap-3 rounded-2xl bg-neutral-900/95 p-4 ring-1 ring-white/10">
      <div className="flex gap-3">
        <FramingDiagram idea={idea} />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight">{idea.title}</h3>
          <p className="mt-1 text-sm leading-snug text-neutral-300">{idea.why}</p>
        </div>
      </div>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-400">{t("photographer", lang)}</dt>
          <dd className="leading-snug">{idea.photographer.say}</dd>
        </div>
        {idea.subject && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-400">{t("inPhoto", lang)}</dt>
            <dd className="leading-snug">{idea.subject.say}</dd>
          </div>
        )}
      </dl>
      <button type="button" className="mt-auto min-h-12 rounded-full bg-green-400 px-4 py-3 text-base font-semibold text-black active:scale-[0.98]" onClick={onUse}>
        {t("useShot", lang)}
      </button>
    </article>
  );
}
