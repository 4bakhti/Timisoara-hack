"use client";

/**
 * Public recipes. Browsing needs no position; sorting by distance is offered as
 * a choice and happens on the phone, so the position is never sent anywhere.
 */
import Link from "next/link";
import { useState } from "react";
import { FramingDiagram } from "@/components/IdeaCard";
import { recipePath } from "@/components/RecipePublisher";
import { ScreenHeader } from "@/components/ScreenHeader";
import { card, notice, primary, secondary, shell } from "@/components/styles";
import { t, tf, type StringKey } from "@/i18n/strings";
import { api } from "@/lib/api";
import type { Health, Recipe, ShotStyle } from "@/lib/contracts";
import type { RecipeListResult } from "@/lib/api";
import { useLang } from "@/state/lang";
import { storageMode } from "@/state/storage";
import { distanceMeters, formatDistance, locate, type Located } from "@/state/position";
import { useLoaded } from "@/state/useLoaded";

export const STYLE_LABEL: Record<ShotStyle, StringKey> = {
  portrait: "stylePortrait",
  candid: "styleCandid",
  detail: "styleDetail",
  wide: "styleWide",
  dramatic: "styleDramatic",
  playful: "stylePlayful",
};

function positionOf(recipe: Recipe): Located | null {
  return recipe.lat !== undefined && recipe.lng !== undefined ? { lat: recipe.lat, lng: recipe.lng } : null;
}

async function loadRecipes(): Promise<{ result: RecipeListResult; health: Health }> {
  const [result, health] = await Promise.all([api.recipes.listResult(), api.health()]);
  return { result, health };
}

export function RecipeList() {
  const lang = useLang();
  const { value, loading, reload } = useLoaded(loadRecipes);
  const [here, setHere] = useState<Located | null>(null);
  const [locating, setLocating] = useState<"idle" | "locating" | "denied" | "unavailable">("idle");

  const sortNear = async () => {
    if (locating === "locating") return;
    setLocating("locating");
    const found = await locate();
    if (typeof found === "string") {
      setLocating(found);
      return;
    }
    setHere(found);
    setLocating("idle");
  };

  // Hidden and draft recipes are not for the public list, whatever the server sends.
  const unavailable = value?.result.status === "unavailable";
  const visible = (value?.result.status === "ok" ? value.result.recipes : []).filter((recipe) => recipe.status === "public");
  const rows = visible.map((recipe) => {
    const at = positionOf(recipe);
    return { recipe, meters: here && at ? distanceMeters(here, at) : null };
  });
  if (here) rows.sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));

  return (
    <main className={shell}>
      <ScreenHeader title={t("recipesTitle", lang)} lang={lang} />
      <p className="leading-snug text-neutral-300">{t("recipesIntro", lang)}</p>

      {loading ? (
        <p role="status" className="text-neutral-400">
          {t("recipesLoading", lang)}
        </p>
      ) : unavailable ? (
        <section className={`${card} grid gap-3`} role="alert" data-state="unavailable">
          <h2 className="text-lg font-semibold">{t("recipesUnavailable", lang)}</h2>
          <p className="text-sm leading-snug text-neutral-300">{t("recipesUnavailableWhy", lang)}</p>
          <button type="button" className={secondary} onClick={reload}>
            {t("retry", lang)}
          </button>
        </section>
      ) : rows.length === 0 ? (
        <section className={`${card} grid gap-3`} data-state="empty">
          <h2 className="text-lg font-semibold">{t("recipesNone", lang)}</h2>
          <p className="text-sm leading-snug text-neutral-300">{t("recipesEmptyWhy", lang)}</p>
          <button type="button" className={secondary} onClick={reload}>
            {t("retry", lang)}
          </button>
          <Link href="/shoot" className={primary}>
            {t("makeFirst", lang)}
          </Link>
        </section>
      ) : (
        <>
          {value && storageMode(value.health) === "memory" && <p className={notice}>{t("tempStorageRecipe", lang)}</p>}

          <div className="grid gap-2">
            {here ? (
              <p role="status" className="text-sm text-neutral-300">
                {t("sortedNear", lang)}
              </p>
            ) : (
              <button type="button" className={secondary} onClick={sortNear} disabled={locating === "locating"}>
                {t(locating === "locating" ? "locating" : "sortNear", lang)}
              </button>
            )}
            {(locating === "denied" || locating === "unavailable") && (
              <p role="status" className="text-sm text-amber-200">
                {t(locating === "denied" ? "positionDenied" : "positionUnavailable", lang)}
              </p>
            )}
            <p className="text-xs text-neutral-400">{t("sortNearHint", lang)}</p>
          </div>

          <ul className="grid gap-3">
            {rows.map(({ recipe, meters }) => (
              <li key={recipe.id}>
                <Link href={recipePath(recipe.id)} className={`${card} flex gap-3 active:scale-[0.99]`}>
                  <FramingDiagram idea={recipe.idea} className={recipe.idea.photographer.orientation === "portrait" ? "h-24 w-auto" : "h-auto w-24"} />
                  <span className="grid min-w-0 content-start gap-1">
                    <span className="text-lg font-semibold leading-tight">{recipe.title}</span>
                    {recipe.sample && <span><span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-normal normal-case tracking-normal text-amber-200">{t("madeFromSample", lang)}</span></span>}
                    <span className="text-xs uppercase tracking-wide text-neutral-400">
                      {[t(STYLE_LABEL[recipe.idea.style], lang), recipe.place, meters !== null ? tf("distanceAway", lang, { d: formatDistance(meters, lang) }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="line-clamp-2 text-sm leading-snug text-neutral-300">{recipe.idea.why}</span>
                    {recipe.uses > 0 && <span className="text-xs text-neutral-400">{tf("usedTimes", lang, { n: recipe.uses })}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <button type="button" className={secondary} onClick={reload}>
            {t("refresh", lang)}
          </button>
        </>
      )}
    </main>
  );
}
