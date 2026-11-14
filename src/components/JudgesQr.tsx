"use client";

import { QrCode } from "@/components/QrCode";
import { isLocalOnly, useOrigin } from "@/components/ShareLink";
import { notice } from "@/components/styles";
import { t } from "@/i18n/strings";
import type { Lang } from "@/lib/contracts";

/**
 * A QR code that opens /shoot on whatever address this page was opened from,
 * so someone looking at a laptop can continue on their own phone.
 */
export function JudgesQr({ lang }: { lang: Lang }) {
  const origin = useOrigin();
  if (!origin) return null;
  const url = new URL("/shoot", origin).toString();
  return (
    <figure className="grid justify-items-center gap-4 rounded-3xl bg-white/5 p-8 text-center" data-testid="judges-qr">
      <QrCode value={url} label={t("scanQrAlt", lang)} className="h-64 w-64" />
      <figcaption className="grid gap-2">
        <span className="text-2xl font-semibold">{t("scanToTry", lang)}</span>
        <span className="text-sm text-neutral-400">{url}</span>
      </figcaption>
      {isLocalOnly(url) && <p className={`${notice} max-w-sm`}>{t("scanLocal", lang)}</p>}
    </figure>
  );
}
