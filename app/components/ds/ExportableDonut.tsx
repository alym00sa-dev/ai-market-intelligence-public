"use client"

import { useRef } from "react"
import type { DonutSegment } from "./Donut"
import { downloadSvgAsPng } from "./downloadSvg"

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * A labeled donut rendered entirely in SVG (title + ring + legend with %), plus a
 * "Download PNG" button. Self-contained so the exported image is slide-ready.
 */
export function ExportableDonut({
  title,
  segments,
  filename,
}: {
  title: string
  segments: DonutSegment[]
  filename: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)

  const present = segments.filter((s) => s.value > 0)
  const total = present.reduce((s, x) => s + x.value, 0)

  const W = 340
  const titleY = 26
  const cx = 90
  const cy = 150
  const r = 56
  const thickness = 16
  const c = 2 * Math.PI * r
  const rowH = 22
  const legendTop = 96
  const H = Math.max(cy + r + 24, legendTop + present.length * rowH + 16)

  let offset = 0

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ background: "#ffffff", borderRadius: 8 }}
      >
        <text x={20} y={titleY} fontSize={14} fontWeight={600} fill="var(--text-primary)"
          fontFamily="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif">
          {title}
        </text>

        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={thickness} />
        {/* segments */}
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {total > 0 && present.map((seg) => {
            const len = (seg.value / total) * c
            const el = (
              <circle
                key={seg.label}
                cx={cx} cy={cy} r={r} fill="none"
                stroke={seg.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={20} fontWeight={600} fill="var(--text-primary)"
          fontFamily="IBM Plex Mono, ui-monospace, monospace">
          {total.toLocaleString()}
        </text>

        {/* legend */}
        {present.map((seg, i) => {
          const y = legendTop + i * rowH
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
          return (
            <g key={seg.label} fontFamily="IBM Plex Sans, ui-sans-serif, system-ui, sans-serif">
              <rect x={190} y={y} width={10} height={10} rx={2} fill={seg.color} />
              <text x={206} y={y + 9} fontSize={11} fill="var(--text-secondary)">{seg.label}</text>
              <text x={W - 16} y={y + 9} fontSize={11} fontWeight={600} textAnchor="end"
                fill="var(--text-primary)" fontFamily="IBM Plex Mono, ui-monospace, monospace">
                {seg.value} · {pct}%
              </text>
            </g>
          )
        })}
      </svg>

      <button
        onClick={() => svgRef.current && downloadSvgAsPng(svgRef.current, filename)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
        style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        Download PNG
      </button>
    </div>
  )
}
