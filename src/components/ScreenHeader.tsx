"use client";

import Link from "next/link";
import { LangToggle } from "@/components/LangToggle";
import { t, type StringKey } from "@/i18n/strings";
import type { Lang } from "@/lib/contracts";

const quiet = "inline-flex min-h-11 items-center justify-center rounded-full bg-white/10 px-4 text-sm font-medium active:scale-95";

/** Top of a plain page: a way back, the page title, and the language switch. */
export function ScreenHeader({ title, backHref = "/", backLabel = "home", lang }: { title: string; backHref?: string; backLabel?: StringKey; lang: Lang }) {
  return (
    <header className="grid gap-4">
      <nav className="flex items-center justify-between gap-2">
        <Link href={backHref} className={quiet}>
          <span aria-hidden="true" className="mr-1">
            ←
          </span>
          {t(backLabel, lang)}
        </Link>
        <LangToggle className={quiet} />
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
    </header>
  );
}
