import { FramingDiagram } from "@/components/IdeaCard";
import { t } from "@/i18n/strings";
import type { Lang, ShotIdea } from "@/lib/contracts";

/** A shot idea as read-only text with its framing drawing: what a recipe contains. */
export function IdeaSummary({ idea, lang }: { idea: ShotIdea; lang: Lang }) {
  return (
    <div className="flex gap-3">
      <FramingDiagram idea={idea} />
      <dl className="grid min-w-0 content-start gap-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-400">{t("whyItWorks", lang)}</dt>
          <dd className="leading-snug">{idea.why}</dd>
        </div>
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
    </div>
  );
}
