"use client";

/**
 * The results screen: what the server actually recorded, by app version.
 *
 * Three different situations get three different screens: the service did not
 * answer, it answered with nothing recorded, or it answered with numbers. A
 * value the server could not measure is shown as "Not measured", never as 0,
 * and nothing is filled in to make the page look better.
 */
import type { ReactNode } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { card, notice, secondary } from "@/components/styles";
import { formatNumber, t, tf } from "@/i18n/strings";
import { api } from "@/lib/api";
import { APP_VERSION } from "@/lib/brand";
import type { Health, Lang, Stats } from "@/lib/contracts";
import { useLang } from "@/state/lang";
import { storageMode } from "@/state/storage";
import { useLoaded } from "@/state/useLoaded";

/** Below this many sessions in total, the page says the numbers are small. */
const SMALL_SAMPLE = 30;

const page =
  "mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]";

async function loadStats(): Promise<{ stats: Stats | null; health: Health }> {
  const [result, health] = await Promise.all([api.statsResult(), api.health()]);
  return { stats: result.status === "ok" ? result.stats : null, health };
}

function signed(value: number, lang: Lang): string {
  const text = formatNumber(Math.abs(value), lang);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

function Row({ label, children, muted = false }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-white/10 py-2 first:border-t-0">
      <dt className="text-sm text-neutral-300">{label}</dt>
      <dd className={`text-right font-semibold tabular-nums ${muted ? "font-normal text-neutral-400" : ""}`}>{children}</dd>
    </div>
  );
}

type Version = Stats["versions"][number];

function VersionCard({ version, lang }: { version: Version; lang: Lang }) {
  const current = version.appVersion === APP_VERSION;
  return (
    <section className={card} aria-label={tf("versionLabel", lang, { v: version.appVersion })}>
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
        {tf("versionLabel", lang, { v: version.appVersion })}
        {current && <span className="rounded-full bg-green-400/20 px-3 py-1 text-xs font-normal text-green-200">{t("thisBuild", lang)}</span>}
      </h2>
      <dl className="mt-2">
        <Row label={t("sessions", lang)}>{formatNumber(version.sessions, lang)}</Row>
        <Row label={t("captured", lang)}>
          {tf("ofTotal", lang, { a: formatNumber(version.captured, lang), b: formatNumber(version.sessions, lang) })}
        </Row>
        <Row label={t("medianTime", lang)} muted={version.medianSecondsToMatch === null}>
          {version.medianSecondsToMatch === null
            ? t("unmeasured", lang)
            : tf("secondsValue", lang, { n: formatNumber(version.medianSecondsToMatch, lang) })}
        </Row>
        <Row label={t("scoreGain", lang)} muted={version.avgScoreGain === null}>
          {version.avgScoreGain === null ? t("unmeasured", lang) : tf("pointsValue", lang, { n: signed(version.avgScoreGain, lang) })}
        </Row>
        <Row label={t("ratingAvg", lang)} muted={version.avgRating === null}>
          {version.avgRating === null
            ? t("noRatings", lang)
            : tf("ratingValue", lang, { avg: formatNumber(version.avgRating, lang), n: formatNumber(version.ratings, lang) })}
        </Row>
      </dl>
    </section>
  );
}

export function StatsView() {
  const lang = useLang();
  const { value, loading, reload } = useLoaded(loadStats);
  const stats = value?.stats ?? null;
  const empty = stats !== null && stats.versions.length === 0 && stats.votes.total === 0;
  const totalSessions = stats?.versions.reduce((sum, version) => sum + version.sessions, 0) ?? 0;

  return (
    <main className={page}>
      <ScreenHeader title={t("statsTitle", lang)} lang={lang} />
      <p className="leading-snug text-neutral-300">{t("statsIntro", lang)}</p>

      {loading ? (
        <p role="status" className="text-neutral-400">
          {t("statsLoading", lang)}
        </p>
      ) : stats === null ? (
        <section className={`${card} grid gap-3`} role="alert" data-state="unavailable">
          <h2 className="text-lg font-semibold">{t("statsUnavailable", lang)}</h2>
          <p className="text-sm leading-snug text-neutral-300">{t("statsUnavailableWhy", lang)}</p>
          <button type="button" className={secondary} onClick={reload}>
            {t("retry", lang)}
          </button>
        </section>
      ) : (
        <>
          {value && storageMode(value.health, stats) === "memory" && (
            <p className={notice} data-state="temporary">
              {t("statsTemp", lang)}
            </p>
          )}

          {empty ? (
            <section className={`${card} grid gap-2`} data-state="empty">
              <h2 className="text-lg font-semibold">{t("statsEmpty", lang)}</h2>
              <p className="text-sm leading-snug text-neutral-300">{t("statsEmptyWhy", lang)}</p>
            </section>
          ) : (
            <>
              {totalSessions < SMALL_SAMPLE && <p className="text-sm leading-snug text-neutral-400">{t("statsSmall", lang)}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                {stats.versions.map((version) => (
                  <VersionCard key={version.appVersion} version={version} lang={lang} />
                ))}
              </div>

              <section className={card}>
                <h2 className="text-lg font-semibold">{t("votesTitle", lang)}</h2>
                {stats.votes.total > 0 ? (
                  <>
                    <p className="mt-2 leading-snug">
                      {tf("votesLine", lang, {
                        a: formatNumber(stats.votes.preferredAfter, lang),
                        b: formatNumber(stats.votes.total, lang),
                      })}
                    </p>
                    <p className="mt-2 text-xs leading-snug text-neutral-400">{t("votesExplain", lang)}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-neutral-400">{t("votesNone", lang)}</p>
                )}
              </section>

              <p className="text-xs leading-snug text-neutral-400">{t("scoreCaveat", lang)}</p>
            </>
          )}

          <button type="button" className={secondary} onClick={reload}>
            {t("refresh", lang)}
          </button>
        </>
      )}
    </main>
  );
}
