"use client";

/**
 * One recipe, opened from a link or a QR code. Shows the shot, then hands its
 * idea to the camera coach when the user asks to recreate it. The camera is
 * only requested from the coach's own "Open the camera" button.
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { IdeaSummary } from "@/components/IdeaSummary";
import { STYLE_LABEL } from "@/components/RecipeList";
import { recipePath } from "@/components/RecipePublisher";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ShareLink } from "@/components/ShareLink";
import { ShootFlow } from "@/components/ShootFlow";
import { card, notice, primary, secondary, shell } from "@/components/styles";
import { t, tf } from "@/i18n/strings";
import { api } from "@/lib/api";
import type { Lang } from "@/lib/contracts";
import { useLang } from "@/state/lang";
import { storageMode } from "@/state/storage";
import { useLoaded } from "@/state/useLoaded";

function formatDate(iso: string, lang: Lang): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "ro" ? "ro-RO" : "en-GB", { dateStyle: "medium" }).format(date);
}

export function RecipeView({ id }: { id: string }) {
  const lang = useLang();
  const load = useCallback(async () => {
    const [result, health] = await Promise.all([api.recipes.load(id), api.health()]);
    return { result, health };
  }, [id]);
  const { value, loading, reload } = useLoaded(load);
  const [recreating, setRecreating] = useState(false);

  const recipe = value?.result.status === "ok" ? value.result.recipe : null;
  const notFound = value?.result.status === "not_found";

  if (recipe && recreating) return <ShootFlow recipe={recipe} onExit={() => setRecreating(false)} />;

  if (loading) {
    return (
      <main className={shell}>
        <ScreenHeader title={t("recipesTitle", lang)} backHref="/recipes" backLabel="allRecipes" lang={lang} />
        <p role="status" className="text-neutral-400">
          {t("recipeLoading", lang)}
        </p>
      </main>
    );
  }

  if (!recipe) {
    return (
      <main className={shell}>
        <ScreenHeader title={t("recipesTitle", lang)} backHref="/recipes" backLabel="allRecipes" lang={lang} />
        <section className={`${card} grid gap-3`} role="alert">
          <h2 className="text-lg font-semibold">{t(notFound ? "recipeNotFound" : "recipeMissing", lang)}</h2>
          <p className="text-sm leading-snug text-neutral-300">{t(notFound ? "recipeNotFoundWhy" : "recipeUnavailableWhy", lang)}</p>
          {!notFound && (
            <button type="button" className={secondary} onClick={reload}>
              {t("retry", lang)}
            </button>
          )}
          <Link href="/recipes" className={secondary}>
            {t("allRecipes", lang)}
          </Link>
        </section>
      </main>
    );
  }

  const published = formatDate(recipe.createdAt, lang);
  const hasPosition = recipe.lat !== undefined && recipe.lng !== undefined;
  const byline = [
    t(STYLE_LABEL[recipe.idea.style], lang),
    recipe.ownerName ? tf("byOwner", lang, { name: recipe.ownerName }) : null,
    published ? tf("publishedOn", lang, { date: published }) : null,
    recipe.uses > 0 ? tf("usedTimes", lang, { n: recipe.uses }) : null,
  ].filter(Boolean);

  return (
    <main className={shell}>
      <ScreenHeader title={recipe.title} backHref="/recipes" backLabel="allRecipes" lang={lang} />
      <p className="-mt-3 text-sm text-neutral-400">{byline.join(" · ")}</p>

      {recipe.status !== "public" && <p className={notice}>{tf("notPublicBanner", lang, { status: recipe.status })}</p>}
      {recipe.sample && <p className={notice}>{t("madeFromSample", lang)}</p>}
      {value && storageMode(value.health) === "memory" && <p className={notice}>{t("tempStorageRecipe", lang)}</p>}

      <section className={card}>
        <IdeaSummary idea={recipe.idea} lang={lang} />
        <h2 className="mt-4 text-xs uppercase tracking-wide text-neutral-400">{t("lookFor", lang)}</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-200">
          {recipe.idea.usesFromScene.map((thing) => (
            <li key={thing}>{thing}</li>
          ))}
        </ul>
      </section>

      {(recipe.place || hasPosition) && (
        <section className={`${card} grid gap-2 text-sm`}>
          {recipe.place && (
            <p>
              <span className="text-neutral-400">{t("placeLabel", lang)}: </span>
              {recipe.place}
            </p>
          )}
          {hasPosition && (
            <p>
              <span className="text-neutral-400">{t("positionLabel", lang)}: </span>
              {recipe.lat!.toFixed(4)}, {recipe.lng!.toFixed(4)}{" "}
              <a
                className="underline"
                href={`https://www.openstreetmap.org/?mlat=${recipe.lat}&mlon=${recipe.lng}#map=18/${recipe.lat}/${recipe.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("openMap", lang)}
              </a>
            </p>
          )}
        </section>
      )}

      <div className="grid gap-2">
        <button type="button" className={primary} onClick={() => setRecreating(true)}>
          {t("recreate", lang)}
        </button>
        <p className="text-center text-xs text-neutral-400">{t("recreateHint", lang)}</p>
      </div>

      {recipe.status === "public" && (
        <section className={card}>
          <ShareLink path={recipePath(recipe.id)} title={recipe.title} lang={lang} />
        </section>
      )}
    </main>
  );
}
