"use client";

import { pill } from "@/components/styles";
import { t } from "@/i18n/strings";
import { setLang, useLang } from "@/state/lang";

/** Switches between English and Romanian. The choice applies to every screen. */
export function LangToggle({ className = pill }: { className?: string }) {
  const lang = useLang();
  return (
    <button type="button" className={className} onClick={() => setLang(lang === "en" ? "ro" : "en")} aria-label={t("switchLang", lang)}>
      {lang === "en" ? "EN" : "RO"}
    </button>
  );
}
