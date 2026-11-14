import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The app icon as a PNG for home screens: viewfinder corners around a green dot, as in public/icon.svg. */
export default function AppleIcon() {
  const corner = (position: Record<string, number>, sides: Record<string, string>) => (
    <div style={{ position: "absolute", width: 34, height: 34, borderRadius: 4, ...position, ...sides }} />
  );
  const line = "16px solid #f5f5f5";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0a0a0a" }}>
        {corner({ left: 34, top: 34 }, { borderLeft: line, borderTop: line })}
        {corner({ right: 34, top: 34 }, { borderRight: line, borderTop: line })}
        {corner({ right: 34, bottom: 34 }, { borderRight: line, borderBottom: line })}
        {corner({ left: 34, bottom: 34 }, { borderLeft: line, borderBottom: line })}
        <div style={{ position: "absolute", left: 68, top: 68, width: 44, height: 44, borderRadius: 22, background: "#4ade80" }} />
      </div>
    ),
    size,
  );
}
