"use client";

/**
 * Coaching sessions per hour over the last 48 hours, from the stats answer's
 * `activity` (on Tiger Data, a TimescaleDB continuous aggregate).
 *
 * One series, so no legend: the title names it. Thin columns with a 2px gap,
 * one value label on the busiest hour, recessive hairlines. Pointing at,
 * focusing or tapping a column shows that hour's numbers in the readout, and
 * the same numbers are in a table.
 */
import { useId, useState } from "react";
import { card } from "@/components/styles";
import { formatNumber, t, tf, type StringKey } from "@/i18n/strings";
import type { Lang, Stats } from "@/lib/contracts";

type Activity = NonNullable<Stats["activity"]>;
type Hour = Activity["hours"][number];

const SLOTS = 48;
const HOUR_MS = 3_600_000;
/** The validated single-series blue for the dark card surface, and its lighter hover step. */
const BAR = "bg-[#3987e5]";
const BAR_ACTIVE = "bg-[#6da7ec]";

const SOURCE_NOTE: Record<Activity["source"], StringKey> = {
  continuous_aggregate: "activitySourceCagg",
  events: "activitySourceEvents",
  memory: "activitySourceMemory",
};

/** A clean top for the axis: 1, 2, 3, 4, 5, 6, 8 or 10 times a power of ten. */
function niceTop(max: number): number {
  if (max <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 3, 4, 5, 6, 8, 10].find((step) => step * power >= max) ?? 10) * power;
}

export function ActivityChart({ activity, lang, now: fixedNow }: { activity: Activity; lang: Lang; now?: number }) {
  const titleId = useId();
  // The clock is read once, when the chart mounts; the stats page remounts it when newer hours arrive.
  const [mountedAt] = useState(Date.now);
  const now = fixedNow ?? mountedAt;
  const locale = lang === "ro" ? "ro-RO" : "en-GB";
  const hourName = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  const last = Math.floor(now / HOUR_MS) * HOUR_MS;
  const byStart = new Map(activity.hours.map((hour) => [Date.parse(hour.start), hour]));
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const start = last - (SLOTS - 1 - i) * HOUR_MS;
    return { start, hour: byStart.get(start) ?? null };
  });
  const shown = slots.filter((slot): slot is { start: number; hour: Hour } => slot.hour !== null);
  const total = shown.reduce((sum, slot) => sum + slot.hour.sessions, 0);
  const busiest = shown.reduce<(typeof shown)[number] | null>((best, slot) => (!best || slot.hour.sessions > best.hour.sessions ? slot : best), null);
  const top = niceTop(busiest?.hour.sessions ?? 1);

  const [picked, setPicked] = useState<number | null>(null);
  const active = shown.find((slot) => slot.start === picked) ?? busiest;

  const describe = ({ start, hour }: { start: number; hour: Hour }) =>
    [
      hourName.format(start),
      hour.sessions === 1 ? t("activityOneSession", lang) : tf("activitySessions", lang, { n: formatNumber(hour.sessions, lang) }),
      hour.avgScore === null ? null : tf("activityScore", lang, { n: formatNumber(Math.round(hour.avgScore), lang) }),
      hour.avgFps === null ? null : tf("activityFps", lang, { n: formatNumber(Math.round(hour.avgFps), lang) }),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <section className={card} aria-labelledby={titleId} data-state="activity">
      <h2 id={titleId} className="text-lg font-semibold">
        {t("activityTitle", lang)}
      </h2>
      <p className="mt-1 text-sm leading-snug text-neutral-400">{t("activityIntro", lang)}</p>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">{t("activityNone", lang)}</p>
      ) : (
        <>
          <p className="mt-3 min-h-10 text-sm leading-snug text-neutral-200" aria-live="polite">
            {active && describe(active)}
          </p>

          <div className="mt-2 flex gap-2">
            {/* Axis: a clean top value and the baseline. */}
            <div className="relative h-36 w-6 shrink-0 text-right text-[10px] tabular-nums text-neutral-500" aria-hidden="true">
              <span className="absolute -top-1.5 right-0">{formatNumber(top, lang)}</span>
              <span className="absolute -bottom-1.5 right-0">0</span>
            </div>
            <div className="relative h-36 min-w-0 flex-1">
              <div className="absolute inset-x-0 top-0 border-t border-white/10" aria-hidden="true" />
              <div className="absolute inset-x-0 top-1/2 border-t border-white/10" aria-hidden="true" />
              <div className="absolute inset-0 flex items-end gap-[2px] border-b border-white/20" role="group" aria-label={tf("activityTotal", lang, { n: formatNumber(total, lang) })}>
                {slots.map((slot) =>
                  slot.hour ? (
                    <button
                      key={slot.start}
                      type="button"
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                      aria-label={describe({ start: slot.start, hour: slot.hour })}
                      aria-pressed={active?.start === slot.start}
                      onPointerEnter={() => setPicked(slot.start)}
                      onFocus={() => setPicked(slot.start)}
                      onClick={() => setPicked(slot.start)}
                    >
                      {slot.start === busiest?.start && (
                        <span className="mb-0.5 text-[10px] tabular-nums text-neutral-300" aria-hidden="true">
                          {formatNumber(slot.hour.sessions, lang)}
                        </span>
                      )}
                      <span
                        className={`block w-full max-w-6 rounded-t-[4px] ${active?.start === slot.start ? BAR_ACTIVE : BAR}`}
                        style={{ height: `${(slot.hour.sessions / top) * 100}%` }}
                      />
                    </button>
                  ) : (
                    <span key={slot.start} className="h-full min-w-0 flex-1" aria-hidden="true" />
                  ),
                )}
              </div>
            </div>
          </div>

          {/* Time labels every six hours, under their columns. */}
          <div className="mt-1 flex gap-2" aria-hidden="true">
            <span className="w-6 shrink-0" />
            <div className="relative h-4 min-w-0 flex-1 text-[10px] tabular-nums text-neutral-500">
              {slots.map((slot, i) =>
                new Date(slot.start).getHours() % 6 === 0 ? (
                  <span
                    key={slot.start}
                    className={`absolute -translate-x-1/2 whitespace-nowrap ${new Date(slot.start).getHours() % 12 === 0 ? "" : "hidden sm:inline"}`}
                    style={{ left: `${((i + 0.5) / SLOTS) * 100}%` }}
                  >
                    {clock.format(slot.start)}
                  </span>
                ) : null,
              )}
            </div>
          </div>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-neutral-300">{t("activityTable", lang)}</summary>
            <table className="mt-2 w-full text-left tabular-nums">
              <thead className="text-xs text-neutral-400">
                <tr>
                  <th className="py-1 font-normal">{t("activityHourCol", lang)}</th>
                  <th className="py-1 text-right font-normal">{t("sessions", lang)}</th>
                  <th className="py-1 text-right font-normal">{t("activityScoreCol", lang)}</th>
                  <th className="py-1 text-right font-normal">{t("activityFpsCol", lang)}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ start, hour }) => (
                  <tr key={start} className="border-t border-white/10">
                    <td className="whitespace-nowrap py-1 pr-2">{hourName.format(start)}</td>
                    <td className="py-1 text-right">{formatNumber(hour.sessions, lang)}</td>
                    <td className="py-1 text-right">{hour.avgScore === null ? "–" : formatNumber(Math.round(hour.avgScore), lang)}</td>
                    <td className="py-1 text-right">{hour.avgFps === null ? "–" : formatNumber(Math.round(hour.avgFps), lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}

      <p className="mt-3 text-xs leading-snug text-neutral-400">{t(SOURCE_NOTE[activity.source], lang)}</p>
    </section>
  );
}
