import QRCode from "qrcode";

/** Blank modules around the code. Scanners need four on every side. */
const QUIET = 4;

/** The dark squares of the code as one SVG path, or null when the text cannot be encoded. */
export function qrPath(value: string): { path: string; side: number } | null {
  try {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let path = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) path += `M${col + QUIET},${row + QUIET}h1v1h-1z`;
      }
    }
    return { path, side: modules.size + QUIET * 2 };
  } catch {
    return null;
  }
}

/**
 * A QR code for `value`, drawn as crisp black squares on white so it scans on a
 * dark page. Renders nothing when the value cannot be encoded; check `qrPath`
 * first to show a message instead.
 */
export function QrCode({ value, label, className = "h-52 w-52" }: { value: string; label: string; className?: string }) {
  const drawn = qrPath(value);
  if (!drawn) return null;
  return (
    <svg
      viewBox={`0 0 ${drawn.side} ${drawn.side}`}
      className={`${className} rounded-lg bg-white`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-qr-value={value}
    >
      <path d={drawn.path} fill="#000" />
    </svg>
  );
}
