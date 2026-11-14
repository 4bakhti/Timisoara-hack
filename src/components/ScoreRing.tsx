/** A ring that fills as the match score rises. Amber while adjusting, green when it matches. */
export function ScoreRing({ score, size = 64, label }: { score: number; size?: number; label?: string }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, score));
  const colour = clamped >= 84 ? "#4ade80" : clamped >= 60 ? "#fbbf24" : "#f5f5f5";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${clamped}`}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.2)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 200ms linear, stroke 200ms linear" }}
        />
      </svg>
      <span className="absolute text-lg font-semibold tabular-nums">{clamped}</span>
    </div>
  );
}
