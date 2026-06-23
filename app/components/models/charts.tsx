"use client"

// Shared SVG chart components for the Models view. Used by BOTH the General tab
// (FrontierModels.tsx) and the Compare tab (CompareTab.tsx). Extracted into this
// module so CompareTab can reuse the charts without a circular import.
//
// Each scatter/line chart accepts an optional `highlightIds` prop: when present
// and non-empty, the matching models are spotlighted and the rest are dimmed;
// when absent (the General tab's usage), the charts render exactly as before.

import { useState, useRef, useEffect } from "react"
import type { ModelRecord } from "../../types"

// ─────────────────────────────────────────────────────────────────────────────
// Moved verbatim from FrontierModels.tsx (helpers, color system, 4 charts).
// ─────────────────────────────────────────────────────────────────────────────
// Captured once at module load — used as the right edge of the frontier timeline.
// (Computing Date.now() during render is an impure call and re-runs unpredictably.)
const NOW_MS = Date.now()

// ── Colors & helpers ──────────────────────────────────────────────────────────

// Brand-aligned org colors. Kept in sync with StatsBar / CompanyComparison / HiringMap.
// TODO: extract to app/lib/brand-colors.ts to remove cross-file duplication.
export const ORG_COLORS: Record<string, string> = {
  "Anthropic":       "#D97757",   // brand coral
  "OpenAI":          "#10A37F",   // brand green
  "Google":          "#4285F4",   // Google blue
  "Meta":            "#1877F2",   // Meta blue
  "Mistral":         "#FF6B35",   // brand flame
  "DeepSeek":        "#06B6D4",   // teal — distinct
  "xAI":             "#1F1F1F",   // brand black
  "NVIDIA":          "#76B900",   // NVIDIA green
  "Microsoft Azure": "#00A4EF",   // Microsoft cyan
  "Amazon":          "#FF9900",   // Amazon orange
  "Cohere":          "#39594D",   // Cohere muted green
  "Alibaba":         "#FF6A00",   // orange
}
const EXTRA_COLORS = ["#A855F7", "#76B900", "#2C4D9E", "#EF4444", "#14B8A6", "#6B5BC9"]
const DEFAULT_COLOR = "#8E97AC"

export function orgColor(org: string) { return ORG_COLORS[org] ?? DEFAULT_COLOR }
export function fmtPrice(n: number | null): string {
  if (n == null) return "n/a"
  if (n < 0.01)  return `$${n.toFixed(4)}`
  if (n < 1)     return `$${n.toFixed(3)}`
  if (n < 10)    return `$${n.toFixed(2)}`
  return `$${n.toFixed(2)}`
}
export function fmtDate(d: string | null): string {
  if (!d) return "n/a"
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) }
  catch { return d }
}
export function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s }
// ── Graph 2: Open vs Closed Frontier (hoverable) ──────────────────────────────

type MetricKey = "intelligence_index" | "coding_index" | "math_index"
const METRIC_OPTS: { key: MetricKey; label: string; color: string; bg: string; text: string }[] = [
  { key: "intelligence_index", label: "Intelligence", color: "#C77F2E", bg: "bg-[var(--accent-amber-bg)]", text: "text-[var(--accent-amber)]" },
  { key: "coding_index",       label: "Coding",       color: "#2C4D9E", bg: "bg-[var(--accent-blue-bg)]",   text: "text-[var(--accent-blue)]"   },
  { key: "math_index",         label: "Math",         color: "#2D8F66", bg: "bg-[var(--accent-green-bg)]",text: "text-[var(--accent-green)]"},
]

type FrontierPt = { date: string; v: number; model: ModelRecord }

export function OpenVsClosedFrontier({ models, highlightIds }: { models: ModelRecord[]; highlightIds?: Set<string> }) {
  const hasFocus = !!(highlightIds && highlightIds.size)
  const [metric, setMetric] = useState<MetricKey>("intelligence_index")
  const metricOpt = METRIC_OPTS.find(o => o.key === metric)!
  const metricColor = metricOpt.color
  const [hovOpen, setHovOpen]     = useState<number | null>(null)
  const [hovClosed, setHovClosed] = useState<number | null>(null)

  const valid = [...models]
    .filter(m => m.release_date && m[metric] != null && m.release_date >= "2023-01-01")
    .sort((a, b) => (a.release_date! < b.release_date! ? -1 : 1))

  let bestOpen = 0, bestClosed = 0
  const openPts: FrontierPt[]   = []
  const closedPts: FrontierPt[] = []

  for (const m of valid) {
    const score = m[metric] as number
    if (m.open_weight === true) {
      if (score > bestOpen) { bestOpen = score; openPts.push({ date: m.release_date!, v: score, model: m }) }
    } else {
      if (score > bestClosed) { bestClosed = score; closedPts.push({ date: m.release_date!, v: score, model: m }) }
    }
  }

  // Focal models plotted as explicit points (even when they never set a SOTA record),
  // so Compare shows where the selected model/company sits relative to the frontier.
  const focalPts: FrontierPt[] = hasFocus
    ? valid.filter((m) => highlightIds!.has(m.id)).map((m) => ({ date: m.release_date!, v: m[metric] as number, model: m }))
    : []

  const allPts = [...openPts, ...closedPts]
  if (allPts.length === 0) return null

  const W = 820, H = 240, PAD_L = 46, PAD_B = 30, PAD_T = 20, PAD_R = 160
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const minDate = new Date("2023-01-01").getTime()
  const maxDate = NOW_MS
  const dateRange = maxDate - minDate

  const allVals  = [...allPts, ...focalPts].map(p => p.v)
  const rawMin   = Math.min(...allVals), rawMax = Math.max(...allVals)
  const padding  = (rawMax - rawMin) * 0.12
  const minV     = Math.max(0, rawMin - padding)
  const maxV     = rawMax + padding
  const valRange = maxV - minV || 1

  const toX = (d: string) => PAD_L + ((new Date(d).getTime() - minDate) / dateRange) * plotW
  const toY = (v: number) => PAD_T + (1 - (v - minV) / valRange) * plotH

  function stepPath(pts: FrontierPt[]): string {
    if (!pts.length) return ""
    let d = `M ${toX(pts[0].date).toFixed(1)} ${toY(pts[0].v).toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      d += ` H ${toX(pts[i].date).toFixed(1)} V ${toY(pts[i].v).toFixed(1)}`
    }
    d += ` H ${(PAD_L + plotW).toFixed(1)}`
    return d
  }

  const quarterMarks: { date: string; label: string; major: boolean }[] = []
  for (let yr = 2023; yr <= 2026; yr++) {
    for (const [month, label, major] of [
      ["01", String(yr), true],
      ["04", "Q2",       false],
      ["07", "Q3",       false],
      ["10", "Q4",       false],
    ] as [string, string, boolean][]) {
      const t = new Date(`${yr}-${month}-01`).getTime()
      if (t > minDate && t < maxDate) {
        quarterMarks.push({ date: `${yr}-${month}-01`, label, major })
      }
    }
  }
  const yStep = Math.ceil((rawMax - rawMin) / 4 / 5) * 5
  const yLabels = Array.from({ length: 6 }, (_, i) => Math.round(rawMin - 5 + i * yStep)).filter(v => v >= minV && v <= maxV)

  const hovPt = hovOpen != null ? openPts[hovOpen] : hovClosed != null ? closedPts[hovClosed] : null
  const lastOpen   = openPts[openPts.length - 1]
  const lastClosed = closedPts[closedPts.length - 1]

  // Plain render helper (not a nested component) — it closes over toX/toY, and
  // defining a component during render is disallowed. Called directly below.
  function renderTooltip(pt: FrontierPt) {
    const x = toX(pt.date), y = toY(pt.v)
    const tx = x > PAD_L + plotW * 0.6 ? x - 158 : x + 10
    const ty = y < 70 ? y + 8 : y - 62
    return (
      <g>
        <rect x={tx} y={ty} width={150} height={54} rx={4} fill="#0F1E3D" fillOpacity={0.93} />
        <text x={tx + 7} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
          {truncate(pt.model.name, 22)}
        </text>
        <text x={tx + 7} y={ty + 26} fontSize={8} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">
          {pt.model.org}
        </text>
        <text x={tx + 7} y={ty + 38} fontSize={8} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
          Score: {pt.v.toFixed(1)}
        </text>
        <text x={tx + 7} y={ty + 49} fontSize={7.5} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">
          Released {fmtDate(pt.date)}
        </text>
      </g>
    )
  }

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Open vs. Closed Capability Over Time</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Best model score at each point in time. Each step marks a new state-of-the-art. Hover any dot to see which model set the record.
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {METRIC_OPTS.map(o => (
            <button key={o.key} onClick={() => setMetric(o.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
                metric === o.key ? "text-white border-transparent" : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
              }`}
              style={metric === o.key ? { backgroundColor: o.color, borderColor: o.color } : {}}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 mb-4">
        <span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="w-6 h-0.5 inline-block rounded" style={{ backgroundColor: metricColor }} />
          Open-weight frontier
          {lastOpen && <span className="text-[var(--text-tertiary)] font-normal">({truncate(lastOpen.model.name, 18)})</span>}
        </span>
        <span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="w-6 h-0.5 bg-[var(--text-tertiary)] inline-block rounded" />
          Closed frontier
          {lastClosed && <span className="text-[var(--text-tertiary)] font-normal">({truncate(lastClosed.model.name, 18)})</span>}
        </span>
        {hasFocus && focalPts.length > 0 && (
          <span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: "#C77F2E" }} />
            Selected {focalPts.length > 1 ? `(${focalPts.length})` : ""}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
          {yLabels.map(v => {
            const y = toY(v)
            return (
              <g key={v}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#EDF0F6" strokeWidth={1} />
                <text x={PAD_L - 6} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">{v}</text>
              </g>
            )
          })}
          {quarterMarks.map(({ date, label, major }) => {
            const x = PAD_L + ((new Date(date).getTime() - minDate) / dateRange) * plotW
            return (
              <g key={date}>
                {major
                  ? <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#DDE3EC" strokeWidth={1} />
                  : <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#EDF0F6" strokeWidth={1} strokeDasharray="3 3" />
                }
                <text x={x} y={H - 6} textAnchor="middle"
                  fontSize={major ? 9 : 7.5} fontWeight={major ? 500 : 400}
                  fill={major ? "#8E97AC" : "#b8c8d8"}
                  fontFamily="ui-sans-serif, system-ui">{label}</text>
              </g>
            )
          })}

          {closedPts.length > 0 && <path d={stepPath(closedPts)} fill="none" stroke="#8E97AC" strokeWidth={2.5} strokeLinejoin="round" />}
          {openPts.length  > 0 && <path d={stepPath(openPts)}  fill="none" stroke={metricColor} strokeWidth={2.5} strokeLinejoin="round" />}

          {closedPts.map((p, i) => {
            const isFocal = hasFocus && highlightIds!.has(p.model.id)
            return (
              <g key={`c${i}`}>
                {isFocal && <circle cx={toX(p.date)} cy={toY(p.v)} r={11} fill="#C77F2E" fillOpacity={0.20} />}
                <circle cx={toX(p.date)} cy={toY(p.v)} r={hovClosed === i || isFocal ? 6.5 : 4.5}
                  fill={isFocal ? "#C77F2E" : "white"} stroke={isFocal ? "#C77F2E" : "#8E97AC"} strokeWidth={hovClosed === i || isFocal ? 2.5 : 1.5}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovClosed(i)}
                  onMouseLeave={() => setHovClosed(null)} />
              </g>
            )
          })}
          {openPts.map((p, i) => {
            const isFocal = hasFocus && highlightIds!.has(p.model.id)
            return (
              <g key={`o${i}`}>
                {isFocal && <circle cx={toX(p.date)} cy={toY(p.v)} r={11} fill="#C77F2E" fillOpacity={0.20} />}
                <circle cx={toX(p.date)} cy={toY(p.v)} r={hovOpen === i || isFocal ? 6.5 : 4.5}
                  fill={isFocal ? "#C77F2E" : "white"} stroke={isFocal ? "#C77F2E" : metricColor} strokeWidth={hovOpen === i || isFocal ? 2.5 : 1.5}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovOpen(i)}
                  onMouseLeave={() => setHovOpen(null)} />
              </g>
            )
          })}
          {/* Focal models as amber diamonds (distinct from frontier circles) — shows
              where the selected entity sits vs the SOTA curve, even if behind it. */}
          {focalPts.map((p, i) => {
            const x = toX(p.date), y = toY(p.v)
            return (
              <g key={`fp${i}`}>
                <circle cx={x} cy={y} r={10} fill="#C77F2E" fillOpacity={0.15} />
                <rect x={x - 4.5} y={y - 4.5} width={9} height={9} transform={`rotate(45 ${x} ${y})`} fill="#C77F2E" stroke="white" strokeWidth={1.3}>
                  <title>{`${p.model.name} — ${metricOpt.label}: ${p.v.toFixed(1)} (${fmtDate(p.date)})`}</title>
                </rect>
              </g>
            )
          })}

          {lastClosed && (
            <text x={PAD_L + plotW + 8} y={toY(lastClosed.v)} dominantBaseline="middle"
              fontSize={8} fill="#4A5878" fontWeight={600} fontFamily="ui-sans-serif, system-ui">
              {truncate(lastClosed.model.name, 20)}
            </text>
          )}
          {lastOpen && (
            <text x={PAD_L + plotW + 8} y={toY(lastOpen.v)} dominantBaseline="middle"
              fontSize={8} fill="#7c3aed" fontWeight={600} fontFamily="ui-sans-serif, system-ui">
              {truncate(lastOpen.model.name, 20)}
            </text>
          )}

          {hovPt && renderTooltip(hovPt)}

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Graph 3: Release Timeline (swimlane dots + scatter chart) ─────────────────

export function ReleaseTimeline({ models }: { models: ModelRecord[] }) {
  const [viewMode, setViewMode] = useState<"chart" | "swimlane">("chart")
  const [hovered, setHovered] = useState<ModelRecord | null>(null)
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string> | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const minDate = new Date("2023-01-01").getTime()
  const maxDate = NOW_MS
  // Extend swimlane end-date so 2026 dots have breathing room
  const swimMaxDate = new Date("2026-10-01").getTime()
  const dateRange = maxDate - minDate
  const swimDateRange = swimMaxDate - minDate

  // ── Chart view (scatter: release date × intelligence) ──
  const chartModels = models.filter(m => {
    if (!m.release_date || m.intelligence_index == null) return false
    const d = new Date(m.release_date)
    return !isNaN(d.getTime()) && d.getFullYear() >= 2023
  })

  const orgModelCounts = new Map<string, number>()
  for (const m of chartModels) {
    orgModelCounts.set(m.org, (orgModelCounts.get(m.org) ?? 0) + 1)
  }
  const chartOrgs = [...orgModelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count >= 2)
    .map(([org]) => org)

  const isOrgSelected = (org: string) => selectedOrgs == null || selectedOrgs.has(org)

  const toggleOrg = (org: string) => {
    const base = selectedOrgs ?? new Set(chartOrgs)
    const next = new Set(base)
    if (next.has(org)) next.delete(org)
    else next.add(org)
    setSelectedOrgs(next.size === chartOrgs.length ? null : next)
  }

  const filteredChartModels = selectedOrgs == null
    ? chartModels
    : chartModels.filter(m => selectedOrgs.has(m.org))

  const W = 820
  const CH = 440, CPAD_L = 64, CPAD_B = 34, CPAD_T = 20, CPAD_R = 20
  const cPlotW = W - CPAD_L - CPAD_R
  const cPlotH = CH - CPAD_T - CPAD_B

  const intels = chartModels.map(m => m.intelligence_index!)
  const minI = intels.length ? Math.max(0, Math.min(...intels) - 3) : 0
  const maxI = intels.length ? Math.min(100, Math.max(...intels) + 3) : 100

  const toChartX = (d: string) => CPAD_L + ((new Date(d).getTime() - minDate) / dateRange) * cPlotW
  const toChartY = (v: number) => CPAD_T + (1 - (v - minI) / (maxI - minI || 1)) * cPlotH

  const yTicks = Array.from({ length: 6 }, (_, i) => Math.round(minI + (i / 5) * (maxI - minI)))
  const quarterMarks: { date: string; label: string; major: boolean }[] = []
  for (let yr = 2023; yr <= 2026; yr++) {
    for (const [month, label, major] of [
      ["01", String(yr), true],
      ["04", "Q2",       false],
      ["07", "Q3",       false],
      ["10", "Q4",       false],
    ] as [string, string, boolean][]) {
      const t = new Date(`${yr}-${month}-01`).getTime()
      if (t >= minDate && t <= maxDate) {
        quarterMarks.push({ date: `${yr}-${month}-01`, label, major })
      }
    }
  }

  // ── Swimlane view ──
  const companyCounts: Record<string, number> = {}
  for (const m of models) {
    if (!m.release_date) continue
    const d = new Date(m.release_date)
    if (isNaN(d.getTime()) || d.getFullYear() < 2023) continue
    companyCounts[m.org] = (companyCounts[m.org] || 0) + 1
  }

  const topOrgs = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([org]) => org)

  const swimModels = models.filter(m => {
    if (!m.release_date || !topOrgs.includes(m.org)) return false
    const d = new Date(m.release_date)
    return !isNaN(d.getTime()) && d.getFullYear() >= 2023
  })

  const ROW_H = 38, PAD_L = 110, PAD_T = 28, PAD_B = 30, PAD_R = 30
  const swimH = topOrgs.length * ROW_H + PAD_T + PAD_B
  const swimW = W - PAD_L - PAD_R

  const toSwimlaneX = (d: string) => PAD_L + ((new Date(d).getTime() - minDate) / swimDateRange) * swimW

  const swimQuarterMarks: { date: string; label: string; major: boolean }[] = []
  for (let yr = 2023; yr <= 2026; yr++) {
    for (const [month, label, major] of [
      ["01", String(yr), true],
      ["04", "Q2",       false],
      ["07", "Q3",       false],
      ["10", "Q4",       false],
    ] as [string, string, boolean][]) {
      const t = new Date(`${yr}-${month}-01`).getTime()
      if (t >= minDate && t <= swimMaxDate) {
        swimQuarterMarks.push({ date: `${yr}-${month}-01`, label, major })
      }
    }
  }

  const orgColors: Record<string, string> = {}
  topOrgs.forEach((org, i) => {
    orgColors[org] = ORG_COLORS[org] ?? EXTRA_COLORS[i % EXTRA_COLORS.length]
  })

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Model Release Timeline</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {viewMode === "chart"
              ? "All models with capability scores plotted by release date vs. Intelligence Index, colored by organization. Hover for details."
              : "Release cadence for the top 10 labs by model count (2023 to present). Each dot is one model release. Hover for details."
            }
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {(["chart", "swimlane"] as const).map(v => (
            <button key={v} onClick={() => { setViewMode(v); setHovered(null) }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
                viewMode === v
                  ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
              }`}>
              {v === "chart" ? "Chart" : "Swimlane"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "chart" && (
        <div className="mt-2 mb-3 relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] hover:border-[var(--border-medium)] transition-colors"
          >
            <span className="text-[var(--text-secondary)] font-medium">
              {selectedOrgs == null
                ? "All companies"
                : selectedOrgs.size === 0
                  ? "No companies"
                  : `${selectedOrgs.size} of ${chartOrgs.length} companies`}
            </span>
            <svg className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform ${dropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-lg z-20 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
                <button onClick={() => setSelectedOrgs(null)}
                  className="text-[11px] text-[var(--accent-amber)] hover:text-[var(--accent-amber)] font-medium transition-colors">All</button>
                <span className="text-[var(--border-medium)]">·</span>
                <button onClick={() => setSelectedOrgs(new Set())}
                  className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] font-medium transition-colors">None</button>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {chartOrgs.map(org => {
                  const selected = isOrgSelected(org)
                  const color = orgColor(org)
                  return (
                    <button key={org} onClick={() => toggleOrg(org)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--bg-base)] transition-colors text-left">
                      <span className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-colors ${selected ? "border-transparent" : "border-[var(--border-medium)] bg-[var(--bg-surface)]"}`}
                        style={selected ? { backgroundColor: color } : {}}>
                        {selected && (
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs text-[var(--text-primary)] truncate">{org}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === "chart" ? (
        <div className="overflow-x-auto">
          <svg width="100%" viewBox={`0 0 ${W} ${CH}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
            {yTicks.map(v => {
              const y = toChartY(v)
              return (
                <g key={v}>
                  <line x1={CPAD_L} y1={y} x2={CPAD_L + cPlotW} y2={y} stroke="#EDF0F6" strokeWidth={1} />
                  <text x={CPAD_L - 6} y={y} textAnchor="end" dominantBaseline="middle"
                    fontSize={10} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">{Math.round(v)}</text>
                </g>
              )
            })}
            {quarterMarks.map(({ date, label, major }) => {
              const x = toChartX(date)
              return (
                <g key={date}>
                  {major
                    ? <line x1={x} y1={CPAD_T} x2={x} y2={CPAD_T + cPlotH} stroke="#DDE3EC" strokeWidth={1} />
                    : <line x1={x} y1={CPAD_T} x2={x} y2={CPAD_T + cPlotH} stroke="#EDF0F6" strokeWidth={1} strokeDasharray="3 3" />
                  }
                  <text x={x} y={CH - 6} textAnchor="middle"
                    fontSize={major ? 11 : 9}
                    fontWeight={major ? 500 : 400}
                    fill={major ? "#8E97AC" : "#b8c8d8"}
                    fontFamily="ui-sans-serif, system-ui">{label}</text>
                </g>
              )
            })}

            {filteredChartModels.map(m => {
              const cx = toChartX(m.release_date!)
              const cy = toChartY(m.intelligence_index!)
              const isHov = hovered?.id === m.id
              return (
                <circle key={m.id} cx={cx} cy={cy} r={isHov ? 9 : 6}
                  fill={orgColor(m.org)} fillOpacity={isHov ? 1 : 0.7}
                  stroke={isHov ? "#0F1E3D" : "white"} strokeWidth={isHov ? 1.5 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(m)}
                  onMouseLeave={() => setHovered(null)}
                />
              )
            })}

            {hovered && hovered.intelligence_index != null && (() => {
              const cx = toChartX(hovered.release_date!)
              const cy = toChartY(hovered.intelligence_index)
              const tx = cx > W * 0.68 ? cx - 246 : cx + 12
              const ty = cy < 100 ? cy + 10 : cy - 100
              return (
                <g>
                  <rect x={tx} y={ty} width={235} height={90} rx={6} fill="#0F1E3D" fillOpacity={0.93} />
                  <text x={tx + 12} y={ty + 22} fontSize={15} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                    {truncate(hovered.name, 22)}
                  </text>
                  <text x={tx + 12} y={ty + 41} fontSize={13} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">{hovered.org}</text>
                  <text x={tx + 12} y={ty + 62} fontSize={13} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
                    Intelligence: {hovered.intelligence_index.toFixed(1)}
                  </text>
                  <text x={tx + 12} y={ty + 79} fontSize={12} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">
                    Released {fmtDate(hovered.release_date)}
                  </text>
                </g>
              )
            })()}

            <line x1={CPAD_L} y1={CPAD_T} x2={CPAD_L} y2={CPAD_T + cPlotH} stroke="#8E97AC" strokeWidth={1} />
            <line x1={CPAD_L} y1={CPAD_T + cPlotH} x2={CPAD_L + cPlotW} y2={CPAD_T + cPlotH} stroke="#8E97AC" strokeWidth={1} />
            <text x={14} y={CPAD_T + cPlotH / 2} textAnchor="middle"
              transform={`rotate(-90, 14, ${CPAD_T + cPlotH / 2})`}
              fontSize={9} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">Intelligence Index</text>
          </svg>
        </div>
      ) : (
        <div className="overflow-x-auto mt-4">
          <svg width="100%" viewBox={`0 0 ${W} ${swimH}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
            {swimQuarterMarks.map(({ date, label, major }) => {
              const x = toSwimlaneX(date)
              return (
                <g key={date}>
                  {major
                    ? <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + topOrgs.length * ROW_H} stroke="#DDE3EC" strokeWidth={1} />
                    : <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + topOrgs.length * ROW_H} stroke="#EDF0F6" strokeWidth={1} strokeDasharray="3 3" />
                  }
                  <text x={x} y={swimH - 6} textAnchor="middle"
                    fontSize={major ? 11 : 9} fontWeight={major ? 500 : 400}
                    fill={major ? "#4A5878" : "#8E97AC"}
                    fontFamily="ui-sans-serif, system-ui">{label}</text>
                </g>
              )
            })}

            {topOrgs.map((org, ri) => {
              const rowY = PAD_T + ri * ROW_H
              const color = orgColors[org]
              const orgModels = swimModels.filter(m => m.org === org)
              return (
                <g key={org}>
                  {ri % 2 === 0 && (
                    <rect x={PAD_L} y={rowY} width={swimW} height={ROW_H} fill="#fafafa" rx={0} />
                  )}
                  <line x1={PAD_L} y1={rowY + ROW_H} x2={PAD_L + swimW} y2={rowY + ROW_H}
                    stroke="#EDF0F6" strokeWidth={1} />
                  <text x={PAD_L - 8} y={rowY + ROW_H / 2} textAnchor="end" dominantBaseline="middle"
                    fontSize={9} fill="#4A5878" fontWeight={500} fontFamily="ui-sans-serif, system-ui">
                    {truncate(org, 16)}
                  </text>
                  <text x={PAD_L - 70} y={rowY + ROW_H / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={8} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">
                    {orgModels.length}
                  </text>
                  {orgModels.map(m => {
                    const x = toSwimlaneX(m.release_date!)
                    const y = rowY + ROW_H / 2
                    const isHov = hovered?.id === m.id
                    return (
                      <circle key={m.id} cx={x} cy={y} r={isHov ? 6 : 4}
                        fill={color} fillOpacity={isHov ? 1 : 0.7}
                        stroke={isHov ? "#0F1E3D" : "white"} strokeWidth={isHov ? 1.5 : 1}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHovered(m)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    )
                  })}
                </g>
              )
            })}

            {hovered && hovered.release_date && topOrgs.includes(hovered.org) && (() => {
              const x = toSwimlaneX(hovered.release_date)
              const ri = topOrgs.indexOf(hovered.org)
              const y = PAD_T + ri * ROW_H + ROW_H / 2
              const tx = x > W * 0.68 ? x - 204 : x + 10
              const ty = y - 68
              return (
                <g>
                  <rect x={tx} y={ty} width={195} height={68} rx={6} fill="#0F1E3D" fillOpacity={0.93} />
                  <text x={tx + 10} y={ty + 18} fontSize={11} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                    {truncate(hovered.name, 22)}
                  </text>
                  <text x={tx + 10} y={ty + 33} fontSize={10} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">{hovered.org}</text>
                  <text x={tx + 10} y={ty + 48} fontSize={10} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
                    Released: {fmtDate(hovered.release_date)}
                  </text>
                  {hovered.intelligence_index != null && (
                    <text x={tx + 10} y={ty + 62} fontSize={9.5} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">
                      Intelligence: {hovered.intelligence_index.toFixed(1)}
                    </text>
                  )}
                </g>
              )
            })()}

            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + topOrgs.length * ROW_H}
              stroke="#8E97AC" strokeWidth={1} />
          </svg>
        </div>
      )}
    </div>
  )
}

// ── Graph 4: Cost vs Intelligence (top 20 + by-company view) ─────────────────

export function CostScatter({ models, inner, highlightIds }: { models: ModelRecord[]; inner?: boolean; highlightIds?: Set<string> }) {
  const [hovered, setHovered] = useState<ModelRecord | null>(null)
  const [viewMode, setViewMode] = useState<"open-closed" | "by-company">("open-closed")
  const hasFocus = !!(highlightIds && highlightIds.size)

  const topOpen = [...models]
    .filter(m => m.open_weight === true && m.intelligence_index != null && m.price_blended != null && m.price_blended > 0)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 10)

  const topClosed = [...models]
    .filter(m => m.open_weight !== true && m.intelligence_index != null && m.price_blended != null && m.price_blended > 0)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 10)

  const topByCompany = [...models]
    .filter(m => m.intelligence_index != null && m.price_blended != null && m.price_blended > 0)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 30)

  const plotBase = viewMode === "by-company" ? topByCompany : [...topOpen, ...topClosed]
  // Force-include focal models even if they fall outside the top-N slice, so the
  // Compare tab can always spotlight the selected entity.
  const focalExtra = hasFocus
    ? models.filter(m => highlightIds!.has(m.id) && m.intelligence_index != null && m.price_blended != null && m.price_blended > 0 && !plotBase.some(p => p.id === m.id))
    : []
  const combined = [...plotBase, ...focalExtra]
  // Focal dots render last so they sit on top of the dimmed field.
  const plotModels = hasFocus
    ? [...combined.filter(m => !highlightIds!.has(m.id)), ...combined.filter(m => highlightIds!.has(m.id))]
    : combined
  if (plotModels.length === 0) return null

  const W = 820, H = 360, PAD_L = 58, PAD_B = 56, PAD_T = 16, PAD_R = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const prices = plotModels.map(m => m.price_blended!)
  const intels = plotModels.map(m => m.intelligence_index!)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const logMin = Math.log10(Math.max(minP, 0.001))
  const logMax = Math.log10(maxP)
  const minI = Math.min(...intels), maxI = Math.max(...intels)

  const toX = (p: number) => PAD_L + ((Math.log10(Math.max(p, 0.001)) - logMin) / (logMax - logMin || 1)) * plotW
  const toY = (v: number) => PAD_T + (1 - (v - minI) / (maxI - minI || 1)) * plotH

  const xTicks = [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 50, 100, 150].filter(t => t >= minP * 0.4 && t <= maxP * 2.5)
  const iStep = (maxI - minI) / 8
  const yTicks = Array.from({ length: 9 }, (_, i) => parseFloat((minI + i * iStep).toFixed(1))).filter(t => t <= maxI + 0.1)

  const dotColor = (m: ModelRecord) =>
    viewMode === "by-company" ? orgColor(m.org) : (m.open_weight === true ? "#a78bfa" : "#8E97AC")

  const uniqueOrgs = viewMode === "by-company"
    ? [...new Set(topByCompany.map(m => m.org))].sort()
    : []

  const inner_ = inner
  return (
    <div className={inner_ ? "px-5 py-4" : "bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4"}>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Capability vs. Cost</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {viewMode === "open-closed"
              ? "Top 10 open-weight and top 10 closed models. Cost on X axis (log scale, blended per 1M tokens); Intelligence Index on Y axis. Hover a dot for details."
              : "Top 30 models with pricing data, colored by company. Cost on X axis (log scale); Intelligence Index on Y axis. Hover a dot for details."
            }
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setViewMode("open-closed")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              viewMode === "open-closed"
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
            }`}>Open / Closed</button>
          <button onClick={() => setViewMode("by-company")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              viewMode === "by-company"
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
            }`}>By Company</button>
        </div>
      </div>

      {viewMode === "open-closed" ? (
        <div className="flex items-center gap-5 mt-3 mb-2">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-amber)] inline-block" /> Open-weight (top 10)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-tertiary)] inline-block" /> Closed (top 10)
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 mb-2">
          {uniqueOrgs.map(org => (
            <span key={org} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: orgColor(org) }} />
              {org}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
          {yTicks.map(t => {
            const y = toY(t)
            if (y < PAD_T - 2 || y > PAD_T + plotH + 2) return null
            return (
              <g key={t}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#EDF0F6" strokeWidth={1} />
                <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={10} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">{t}</text>
              </g>
            )
          })}
          {xTicks.map(t => {
            const x = toX(t)
            if (x < PAD_L - 2 || x > PAD_L + plotW + 2) return null
            return (
              <g key={t}>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#F5F7FB" strokeWidth={1} />
                <text x={x} y={H - PAD_B + 14} textAnchor="middle"
                  fontSize={10} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">
                  ${t < 1 ? t.toFixed(t < 0.01 ? 3 : 2) : t}
                </text>
              </g>
            )
          })}

          {plotModels.map(m => {
            const x = toX(m.price_blended!), y = toY(m.intelligence_index!)
            const isHov = hovered?.id === m.id
            const isFocal = hasFocus && highlightIds!.has(m.id)
            const dim = hasFocus && !isFocal
            return (
              <g key={m.id}>
                {isFocal && <circle cx={x} cy={y} r={12} fill={dotColor(m)} fillOpacity={0.18} />}
                <circle cx={x} cy={y} r={isHov || isFocal ? 7 : 5}
                  fill={dotColor(m)} fillOpacity={isHov ? 1 : dim ? 0.15 : isFocal ? 1 : 0.8}
                  stroke={isFocal || isHov ? "#0F1E3D" : "white"} strokeWidth={isFocal || isHov ? 1.5 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(m)}
                  onMouseLeave={() => setHovered(null)} />
              </g>
            )
          })}

          {hovered && (() => {
            const x = toX(hovered.price_blended!), y = toY(hovered.intelligence_index!)
            const tx = x > W * 0.68 ? x - 276 : x + 12
            const ty = y < 110 ? y + 10 : y - 110
            return (
              <g>
                <rect x={tx} y={ty} width={265} height={104} rx={6} fill="#0F1E3D" fillOpacity={0.93} />
                <text x={tx + 14} y={ty + 24} fontSize={16} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                  {truncate(hovered.name, 24)}
                </text>
                <text x={tx + 14} y={ty + 44} fontSize={14} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">
                  {hovered.org} {hovered.open_weight ? "(open)" : "(closed)"}
                </text>
                <text x={tx + 14} y={ty + 68} fontSize={14} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
                  Intelligence: {hovered.intelligence_index?.toFixed(1)}
                </text>
                <text x={tx + 14} y={ty + 88} fontSize={13} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
                  Price: {fmtPrice(hovered.price_blended)} per 1M tokens
                </text>
              </g>
            )
          })()}

          <text x={PAD_L + plotW / 2} y={H - 8} textAnchor="middle"
            fontSize={11} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">Price per 1M tokens (log scale)</text>
          <text x={14} y={PAD_T + plotH / 2} textAnchor="middle"
            transform={`rotate(-90, 14, ${PAD_T + plotH / 2})`}
            fontSize={11} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">Intelligence Index</text>

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Graph 5: Speed vs Intelligence (top 20 + by-company view) ────────────────

export function SpeedVsIntelligence({ models, inner, highlightIds }: { models: ModelRecord[]; inner?: boolean; highlightIds?: Set<string> }) {
  const [hovered, setHovered] = useState<ModelRecord | null>(null)
  const [viewMode, setViewMode] = useState<"open-closed" | "by-company">("open-closed")
  const hasFocus = !!(highlightIds && highlightIds.size)

  const topOpen = [...models]
    .filter(m => m.open_weight === true && m.intelligence_index != null && m.tokens_per_sec != null && m.tokens_per_sec > 0)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 10)

  const topClosed = [...models]
    .filter(m => m.open_weight !== true && m.intelligence_index != null && m.tokens_per_sec != null && m.tokens_per_sec > 0)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 10)

  const topByCompany = [...models]
    .filter(m => m.intelligence_index != null && m.tokens_per_sec != null && m.tokens_per_sec > 0)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 30)

  const plotBase = viewMode === "by-company" ? topByCompany : [...topOpen, ...topClosed]
  const focalExtra = hasFocus
    ? models.filter(m => highlightIds!.has(m.id) && m.intelligence_index != null && m.tokens_per_sec != null && m.tokens_per_sec > 0 && !plotBase.some(p => p.id === m.id))
    : []
  const combined = [...plotBase, ...focalExtra]
  const plotModels = hasFocus
    ? [...combined.filter(m => !highlightIds!.has(m.id)), ...combined.filter(m => highlightIds!.has(m.id))]
    : combined
  if (plotModels.length === 0) return null

  const W = 820, H = 360, PAD_L = 60, PAD_B = 56, PAD_T = 16, PAD_R = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const intels = plotModels.map(m => m.intelligence_index!)
  const speeds = plotModels.map(m => m.tokens_per_sec!)
  const minI = Math.min(...intels), maxI = Math.max(...intels)
  const minS = 0, maxS = Math.max(...speeds) * 1.08

  const toX = (v: number) => PAD_L + ((v - minI) / (maxI - minI || 1)) * plotW
  const toY = (v: number) => PAD_T + (1 - (v - minS) / (maxS - minS || 1)) * plotH

  const yTicks = [0, 10, 25, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1200, 1500, 2000, 3000].filter(t => t <= maxS * 1.1)
  const xStep  = (maxI - minI) / 9
  const xTicks = Array.from({ length: 10 }, (_, i) => parseFloat((minI + i * xStep).toFixed(1))).filter(t => t <= maxI + 0.1)

  const dotColor = (m: ModelRecord) =>
    viewMode === "by-company" ? orgColor(m.org) : (m.open_weight === true ? "#a78bfa" : "#8E97AC")

  const uniqueOrgs = viewMode === "by-company"
    ? [...new Set(topByCompany.map(m => m.org))].sort()
    : []

  const inner_ = inner
  return (
    <div className={inner_ ? "px-5 py-4" : "bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4"}>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Speed vs. Intelligence</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {viewMode === "open-closed"
              ? "Top 10 open-weight and top 10 closed models by Intelligence Index. Output speed in tokens per second. Hover a dot for details."
              : "Top 30 models with speed data, colored by company. Hover a dot for details."
            }
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setViewMode("open-closed")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              viewMode === "open-closed"
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
            }`}>Open / Closed</button>
          <button onClick={() => setViewMode("by-company")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              viewMode === "by-company"
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
            }`}>By Company</button>
        </div>
      </div>

      {viewMode === "open-closed" ? (
        <div className="flex items-center gap-5 mt-3 mb-2">
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-amber)] inline-block" /> Open-weight (top 10)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-tertiary)] inline-block" /> Closed (top 10)
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 mb-2">
          {uniqueOrgs.map(org => (
            <span key={org} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: orgColor(org) }} />
              {org}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
          {yTicks.map(t => {
            const y = toY(t)
            if (y < PAD_T - 2 || y > PAD_T + plotH + 2) return null
            return (
              <g key={t}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#EDF0F6" strokeWidth={1} />
                <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={10} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">{t}</text>
              </g>
            )
          })}
          {xTicks.map(t => {
            const x = toX(t)
            return (
              <g key={t}>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#F5F7FB" strokeWidth={1} />
                <text x={x} y={H - PAD_B + 14} textAnchor="middle"
                  fontSize={10} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">{t}</text>
              </g>
            )
          })}

          {plotModels.map(m => {
            const x = toX(m.intelligence_index!), y = toY(m.tokens_per_sec!)
            const isHov = hovered?.id === m.id
            const isFocal = hasFocus && highlightIds!.has(m.id)
            const dim = hasFocus && !isFocal
            return (
              <g key={m.id}>
                {isFocal && <circle cx={x} cy={y} r={12} fill={dotColor(m)} fillOpacity={0.18} />}
                <circle cx={x} cy={y} r={isHov || isFocal ? 7 : 5}
                  fill={dotColor(m)} fillOpacity={isHov ? 1 : dim ? 0.15 : isFocal ? 1 : 0.8}
                  stroke={isFocal || isHov ? "#0F1E3D" : "white"} strokeWidth={isFocal || isHov ? 1.5 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(m)}
                  onMouseLeave={() => setHovered(null)} />
              </g>
            )
          })}

          {hovered && (() => {
            const x = toX(hovered.intelligence_index!), y = toY(hovered.tokens_per_sec!)
            const tx = x > W * 0.68 ? x - 276 : x + 12
            const ty = y < 110 ? y + 10 : y - 110
            return (
              <g>
                <rect x={tx} y={ty} width={265} height={104} rx={6} fill="#0F1E3D" fillOpacity={0.93} />
                <text x={tx + 14} y={ty + 24} fontSize={16} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                  {truncate(hovered.name, 24)}
                </text>
                <text x={tx + 14} y={ty + 44} fontSize={14} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">
                  {hovered.org} {hovered.open_weight ? "(open)" : "(closed)"}
                </text>
                <text x={tx + 14} y={ty + 68} fontSize={14} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
                  Intelligence: {hovered.intelligence_index?.toFixed(1)}
                </text>
                <text x={tx + 14} y={ty + 88} fontSize={13} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
                  Speed: {hovered.tokens_per_sec?.toFixed(0)} tokens/sec
                </text>
              </g>
            )
          })()}

          <text x={PAD_L + plotW / 2} y={H - 8} textAnchor="middle"
            fontSize={11} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">Intelligence Index</text>
          <text x={14} y={PAD_T + plotH / 2} textAnchor="middle"
            transform={`rotate(-90, 14, ${PAD_T + plotH / 2})`}
            fontSize={11} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">Output speed (tokens per second)</text>

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}
