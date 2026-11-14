"use client";

import Link from "next/link";
import { JudgesQr } from "@/components/JudgesQr";
import { LangToggle } from "@/components/LangToggle";
import { primary } from "@/components/styles";
import { t, type StringKey } from "@/i18n/strings";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { useLang } from "@/state/lang";

const STEPS: [StringKey, StringKey][] = [
  ["homeRead", "homeReadText"],
  ["homeSuggest", "homeSuggestText"],
  ["homeCoach", "homeCoachText"],
  ["homeCapture", "homeCaptureText"],
];

const quiet = "inline-flex min-h-11 items-center justify-center rounded-full bg-white/10 px-4 text-sm font-medium active:scale-95";

/**
 * The front page: what the app does in four steps, and where to go.
 * On a large screen a QR code sits beside it, so a judge at the laptop can
 * carry on with their own phone. Phones get the single column only.
 */
export function HomeScreen() {
  const lang = useLang();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg items-center justify-center gap-16 lg:max-w-5xl">
      <main className="flex min-h-dvh w-full max-w-lg flex-col justify-between gap-10 px-6 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] lg:min-h-0 lg:py-12">
        <header>
          <div className="flex justify-end">
            <LangToggle className={quiet} />
          </div>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-3 text-xl leading-snug text-neutral-300">{APP_TAGLINE[lang]}</p>
        </header>

        <ol className="grid gap-4">
          {STEPS.map(([title, text], index) => (
            <li key={title} className="flex gap-4">
              <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-400 font-semibold text-black">
                {index + 1}
              </span>
              <p className="leading-snug">
                <span className="font-semibold">{t(title, lang)}.</span> <span className="text-neutral-300">{t(text, lang)}</span>
              </p>
            </li>
          ))}
        </ol>

        <div className="grid gap-3">
          <Link href="/shoot" className={primary}>
            {t("start", lang)}
          </Link>
          <nav className="grid grid-cols-3 gap-2">
            <Link href="/recipes" className={quiet}>
              {t("navRecipes", lang)}
            </Link>
            <Link href="/stats" className={quiet}>
              {t("navStats", lang)}
            </Link>
            <Link href="/lab" className={quiet}>
              {t("navLab", lang)}
            </Link>
          </nav>
          <p className="text-center text-xs text-neutral-400">{t("homeNote", lang)}</p>
        </div>
      </main>

      <aside className="hidden shrink-0 lg:block">
        <JudgesQr lang={lang} />
      </aside>
    </div>
  );
}
