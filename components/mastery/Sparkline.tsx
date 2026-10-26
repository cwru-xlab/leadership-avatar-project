import type { TrendPointDTO } from "@/lib/mastery/mastery-dto";

/**
 * A tiny trend line of the all-time figure over the trend buckets. The
 * vertical axis is FIXED at 0..100 — never auto-scaled to the data — so a
 * one-point wobble does not read as a dramatic swing. Buckets before the
 * first evidence (percent null) are left blank rather than drawn at zero.
 */
export default function Sparkline({
  points,
  label,
  width = 132,
  height = 36,
}: {
  points: TrendPointDTO[];
  label: string;
  width?: number;
  height?: number;
}) {
  const pad = 3;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points
    .map((point, index) =>
      point.percent === null
        ? null
        : {
            x: pad + index * step,
            y: pad + (1 - point.percent / 100) * (height - pad * 2),
            hasNew: point.count > 0,
          }
    )
    .filter((c): c is { x: number; y: number; hasNew: boolean } => c !== null);

  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <line
        x1={pad}
        x2={width - pad}
        y1={height / 2}
        y2={height / 2}
        stroke="#d4e2e9"
        strokeDasharray="2 3"
        strokeWidth={1}
      />
      {coords.length > 1 ? (
        <polyline
          fill="none"
          stroke="#0a7391"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
        />
      ) : null}
      {coords.map((c) => (
        <circle
          key={`${c.x}`}
          cx={c.x}
          cy={c.y}
          r={c.hasNew ? 2.5 : 1.5}
          fill={c.hasNew ? "#0a7391" : "#8fb9c6"}
        />
      ))}
    </svg>
  );
}
