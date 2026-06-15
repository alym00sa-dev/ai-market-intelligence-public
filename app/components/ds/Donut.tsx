"use client"

export type DonutSegment = { label: string; value: number; color: string }

/**
 * Lightweight SVG donut chart. Hand-rolled (no chart dependency) to match the
 * existing StackedBar approach. Renders each segment as a stroked arc via
 * stroke-dasharray; optional center value/label.
 */
export function Donut({
  segments,
  size = 96,
  thickness = 13,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerValue?: string | number
  centerLabel?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2

  let offset = 0
  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* track */}
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke="var(--bg-elevated)" strokeWidth={thickness}
        />
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {total > 0 && segments.filter((s) => s.value > 0).map((seg) => {
            const len = (seg.value / total) * c
            const el = (
              <circle
                key={seg.label}
                cx={cx} cy={cx} r={r} fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              >
                <title>{`${seg.label}: ${seg.value}`}</title>
              </circle>
            )
            offset += len
            return el
          })}
        </g>
      </svg>
      {(centerValue !== undefined || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue !== undefined && (
            <span
              className="font-mono tabular-nums leading-none"
              style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: size > 80 ? 18 : 14 }}
            >
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span
              className="leading-none mt-0.5"
              style={{ color: "var(--text-tertiary)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
