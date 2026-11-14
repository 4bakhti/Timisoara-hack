"use client";

/**
 * Turns a captured shot's idea into a public recipe.
 *
 * Nothing is sent until "Publish recipe" is pressed, and the preview shows
 * exactly what will be sent: a title, the shot idea, and a place or position
 * only if the user adds them. Photos are never part of a recipe.
 *
 * A link and QR code appear only after the server confirmed the recipe exists.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { IdeaSummary } from "@/components/IdeaSummary";
import { ShareLink } from "@/components/ShareLink";
import { card, field, notice, primary, secondary } from "@/components/styles";
import { t, tf, type StringKey } from "@/i18n/strings";
import { api, ApiFailure } from "@/lib/api";
import type { Lang, Recipe, ShotIdea } from "@/lib/contracts";
import { formatCoords, locate, type Located } from "@/state/position";
import { getPoseTemplate } from "@/vision";

const MAX_TITLE = 80;
const MAX_PLACE = 80;

type Phase = "closed" | "editing" | "publishing" | "done";
type PositionState = "idle" | "locating" | "denied" | "unavailable";

/** Why a publish failed, in words the user can act on. */
export function publishError(err: unknown): StringKey {
  if (err instanceof ApiFailure) {
    if (err.status === 501 || err.code === "not_configured") return "errNotConfigured";
    if (err.status === 401 || err.status === 403) return "errAuth";
    if (err.status === 404 || err.status === 405) return "errMissing";
    if (err.status === 429) return "errRate";
    if (err.status >= 400 && err.status < 500) return "errRejected";
    return "errServer";
  }
  if (err instanceof TypeError) return "errNetwork";
  // The server said yes but not in the agreed shape: the save cannot be confirmed.
  return "errUnconfirmed";
}

export function recipePath(id: string): string {
  return `/r/${encodeURIComponent(id)}`;
}

export function RecipePublisher({ idea, sample, lang }: { idea: ShotIdea; sample: boolean; lang: Lang }) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [title, setTitle] = useState(idea.title);
  const [place, setPlace] = useState("");
  const [position, setPosition] = useState<Located | null>(null);
  const [positionState, setPositionState] = useState<PositionState>("idle");
  const [error, setError] = useState<StringKey | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  /** true when the server has no database, so the recipe will not survive a restart. */
  const [temporary, setTemporary] = useState(false);
  const inFlight = useRef(false);

  const addPosition = async () => {
    if (positionState === "locating") return;
    setPositionState("locating");
    const found = await locate();
    if (typeof found === "string") {
      setPositionState(found);
      return;
    }
    setPosition(found);
    setPositionState("idle");
  };

  const publish = async () => {
    const cleanTitle = title.trim();
    if (sample || !cleanTitle || inFlight.current) return;
    inFlight.current = true;
    setPhase("publishing");
    setError(null);
    const cleanPlace = place.trim();
    // The pose's geometry travels with the recipe only when it really is this idea's pose.
    const pose = idea.subject ? getPoseTemplate(idea.subject.poseTemplateId) : null;
    try {
      const [created, health] = await Promise.all([
        api.recipes.create({
          title: cleanTitle,
          idea,
          ...(pose && pose.id === idea.subject?.poseTemplateId ? { targetPose: pose } : {}),
          ...(cleanPlace ? { place: cleanPlace } : {}),
          ...(position ? { lat: position.lat, lng: position.lng } : {}),
        }),
        api.health(),
      ]);
      setRecipe(created);
      setTemporary(!health.db);
      setPhase("done");
    } catch (err) {
      setError(publishError(err));
      setPhase("editing");
    } finally {
      inFlight.current = false;
    }
  };

  if (phase === "closed") {
    return (
      <div className="grid gap-2">
        <button type="button" className={secondary} onClick={() => setPhase("editing")}>
          {t("makeRecipe", lang)}
        </button>
        <p className="text-center text-xs text-neutral-400">{t("makeRecipeHint", lang)}</p>
      </div>
    );
  }

  if (phase === "done" && recipe) {
    const isPublic = recipe.status === "public";
    return (
      <section className={`${card} grid gap-3`} aria-live="polite">
        <h2 className="text-lg font-semibold">{recipe.title}</h2>
        {isPublic ? (
          <>
            <p role="status" className="rounded-xl bg-green-400/15 p-3 text-sm leading-snug text-green-200">
              {t("published", lang)}
            </p>
            {temporary && <p className={notice}>{t("tempStorageRecipe", lang)}</p>}
            <ShareLink path={recipePath(recipe.id)} title={recipe.title} lang={lang} />
            <Link href={recipePath(recipe.id)} className={secondary}>
              {t("openRecipe", lang)}
            </Link>
          </>
        ) : (
          <p role="status" className={notice}>
            {tf("publishedNotPublic", lang, { status: recipe.status })}
          </p>
        )}
      </section>
    );
  }

  if (sample) {
    return (
      <section className={`${card} grid gap-3`}>
        <h2 className="text-lg font-semibold">{t("makeRecipe", lang)}</h2>
        <p role="status" className={notice}>
          {t("samplePublishBlocked", lang)}
        </p>
        <button type="button" className={secondary} onClick={() => setPhase("closed")}>
          {t("back", lang)}
        </button>
      </section>
    );
  }

  const busy = phase === "publishing";

  return (
    <form
      className={`${card} grid gap-4`}
      onSubmit={(event) => {
        event.preventDefault();
        void publish();
      }}
    >
      <h2 className="text-lg font-semibold">{t("recipePreview", lang)}</h2>

      <label className="grid gap-1 text-sm text-neutral-200">
        {t("recipeTitle", lang)}
        <input
          className={field}
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, MAX_TITLE))}
          maxLength={MAX_TITLE}
          required
          disabled={busy}
          autoComplete="off"
          enterKeyHint="done"
        />
      </label>

      <div className="grid gap-2">
        <h3 className="text-sm text-neutral-200">{t("recipeIdea", lang)}</h3>
        <IdeaSummary idea={idea} lang={lang} />
      </div>

      <label className="grid gap-1 text-sm text-neutral-200">
        {t("recipePlace", lang)}
        <input
          className={field}
          value={place}
          onChange={(event) => setPlace(event.target.value.slice(0, MAX_PLACE))}
          maxLength={MAX_PLACE}
          placeholder={t("recipePlaceHint", lang)}
          disabled={busy}
          autoComplete="off"
          enterKeyHint="done"
        />
      </label>

      <div className="grid gap-2">
        {position ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{tf("positionAdded", lang, { coords: formatCoords(position) })}</span>
            <button type="button" className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-medium" onClick={() => setPosition(null)} disabled={busy}>
              {t("removePosition", lang)}
            </button>
          </div>
        ) : (
          <button type="button" className={secondary} onClick={addPosition} disabled={busy || positionState === "locating"}>
            {t(positionState === "locating" ? "locating" : "addPosition", lang)}
          </button>
        )}
        {(positionState === "denied" || positionState === "unavailable") && (
          <p role="status" className="text-sm text-amber-200">
            {t(positionState === "denied" ? "positionDenied" : "positionUnavailable", lang)}
          </p>
        )}
        <p className="text-xs text-neutral-400">{t("positionHint", lang)}</p>
      </div>

      <p className="rounded-xl bg-white/5 p-3 text-sm leading-snug text-neutral-200">{t("publishNotice", lang)}</p>

      {error && (
        <p role="alert" className={notice}>
          <strong className="font-semibold">{t("notPublished", lang)}</strong> {t(error, lang)}
        </p>
      )}

      <div className="grid gap-2">
        <button type="submit" className={primary} disabled={busy || !title.trim()}>
          {t(busy ? "publishing" : error ? "retry" : "publish", lang)}
        </button>
        <button type="button" className={secondary} onClick={() => setPhase("closed")} disabled={busy}>
          {t("cancel", lang)}
        </button>
      </div>
    </form>
  );
}
