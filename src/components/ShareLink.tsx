"use client";

/** The address of a recipe, as text to copy, a QR code to scan, and a share button. */
import { useState, useSyncExternalStore } from "react";
import { QrCode, qrPath } from "@/components/QrCode";
import { field, notice, secondary } from "@/components/styles";
import { t } from "@/i18n/strings";
import type { Lang } from "@/lib/contracts";

const never = () => () => undefined;

/** The page's own address, known only in the browser. */
function useOrigin(): string | null {
  return useSyncExternalStore(
    never,
    () => window.location.origin,
    () => null,
  );
}

function useCanShare(): boolean {
  return useSyncExternalStore(
    never,
    () => typeof navigator.share === "function",
    () => false,
  );
}

/** true for addresses that only work on the device showing them. */
export function isLocalOnly(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function ShareLink({ path, title, lang }: { path: string; title: string; lang: Lang }) {
  const origin = useOrigin();
  const canShare = useCanShare();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  if (!origin) return null;
  const url = new URL(path, origin).toString();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // The share sheet was closed.
    }
  };

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm text-neutral-200">
        {t("shareLinkLabel", lang)}
        <input className={`${field} text-sm`} readOnly value={url} onFocus={(event) => event.currentTarget.select()} data-testid="share-url" />
      </label>

      {isLocalOnly(url) && <p className={notice}>{t("localLink", lang)}</p>}

      {qrPath(url) ? (
        <figure className="grid justify-items-center gap-2">
          <QrCode value={url} label={t("qrAlt", lang)} />
          <figcaption className="text-center text-xs text-neutral-400">{t("qrHint", lang)}</figcaption>
        </figure>
      ) : (
        <p className={notice}>{t("qrFailed", lang)}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={secondary} onClick={copy}>
          {t("copyLink", lang)}
        </button>
        {canShare && (
          <button type="button" className={secondary} onClick={share}>
            {t("shareLink", lang)}
          </button>
        )}
      </div>
      <p role="status" className="min-h-5 text-center text-sm text-neutral-300">
        {copyState === "copied" ? t("copied", lang) : copyState === "failed" ? t("copyFailed", lang) : ""}
      </p>
    </div>
  );
}
