"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import type { ModelsData, ModelRecord, RankedModel } from "../types"

// ── Colors & helpers ──────────────────────────────────────────────────────────

const ORG_COLORS: Record<string, string> = {
  "Anthropic":       "#c084fc",
  "OpenAI":          "#34d399",
  "Google":          "#60a5fa",
  "Meta":            "#fb923c",
  "Mistral":         "#f472b6",
  "DeepSeek":        "#38bdf8",
  "xAI":             "#a3e635",
  "NVIDIA":          "#4ade80",
  "Microsoft Azure": "#93c5fd",
  "Amazon":          "#fbbf24",
  "Cohere":          "#f87171",
  "Alibaba":         "#e879f9",
}
const EXTRA_COLORS = ["#f43f5e", "#06b6d4", "#84cc16", "#6366f1", "#ec4899", "#14b8a6"]
const DEFAULT_COLOR = "#94a3b8"

function orgColor(org: string) { return ORG_COLORS[org] ?? DEFAULT_COLOR }

function fmt(n: number | null, dec = 1): string {
  if (n == null) return "n/a"
  return n.toFixed(dec)
}
function fmtPrice(n: number | null): string {
  if (n == null) return "n/a"
  if (n < 0.01) return `$${n.toFixed(3)}`
  if (n < 1)    return `$${n.toFixed(2)}`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string | null): string {
  if (!d) return "n/a"
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) }
  catch { return d }
}
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s }

// ── RefreshButton ─────────────────────────────────────────────────────────────

type RefreshStatus = {
  state: "idle" | "running" | "done" | "error"
  started_at: string | null
  finished_at: string | null
  log: string[]
  error: string | null
}

function RefreshButton({ builtAt }: { builtAt: string | null }) {
  const [status, setStatus] = useState<RefreshStatus | null>(null)
  const [showLog, setShowLog] = useState(false)

  const startRefresh = useCallback(async () => {
    const res = await fetch("/api/refresh-models", { method: "POST" })
    if (!res.ok) {
      const e = await res.json()
      alert(e.error ?? "Failed to start refresh")
      return
    }
    setStatus({ state: "running", started_at: new Date().toISOString(), finished_at: null, log: ["Starting..."], error: null })
    const poll = setInterval(async () => {
      const r = await fetch("/api/refresh-models")
      const s: RefreshStatus = await r.json()
      setStatus(s)
      if (s.state === "done" || s.state === "error") {
        clearInterval(poll)
        if (s.state === "done") setTimeout(() => window.location.reload(), 1000)
      }
    }, 3000)
  }, [])

  const running = status?.state === "running"

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={startRefresh} disabled={running}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
          running
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
        }`}
      >
        <svg className={`w-3.5 h-3.5 ${running ? "animate-spin text-slate-400" : "text-slate-500"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {running ? "Refreshing…" : "Refresh Data"}
      </button>
      {status && (status.state === "done" || status.state === "error" || status.log.length > 1) && (
        <button onClick={() => setShowLog((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">
          {showLog ? "hide log" : "show log"}
        </button>
      )}
      {showLog && status && (
        <div className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[480px] bg-slate-900 rounded-xl shadow-2xl border border-slate-700 p-4 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-300 font-semibold">Refresh log</span>
            <button onClick={() => setShowLog(false)} className="text-slate-500 hover:text-slate-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {status.log.map((line, i) => <p key={i} className="text-xs font-mono text-slate-400">{line}</p>)}
          </div>
          {status.state === "error" && <p className="mt-2 text-xs text-red-400 font-mono">{status.error}</p>}
          {status.state === "done"  && <p className="mt-2 text-xs text-green-400 font-mono">Complete — reloading…</p>}
        </div>
      )}
    </div>
  )
}

// ── MetadataStrip ─────────────────────────────────────────────────────────────

function MetadataStrip({ data: _data, builtAt }: { data: ModelsData; builtAt: string | null }) {
  return (
    <div className="flex items-center flex-wrap gap-2 text-xs text-slate-400 mt-1">
      <span>
        Data sourced from{" "}
        <span className="text-slate-600 font-medium">Artificial Analysis</span>
        {" "}and{" "}
        <span className="text-slate-600 font-medium">LLM Stats</span>
      </span>
      {builtAt && (
        <>
          <span className="text-slate-300">·</span>
          <span>Last updated {builtAt}</span>
        </>
      )}
    </div>
  )
}

// ── BestInClass ───────────────────────────────────────────────────────────────

function BestInClass({ models }: { models: ModelRecord[] }) {
  const byIntel  = [...models].filter(m => m.intelligence_index != null).sort((a,b) => b.intelligence_index! - a.intelligence_index!)
  const byCoding = [...models].filter(m => m.coding_index != null).sort((a,b) => b.coding_index! - a.coding_index!)
  const byMath   = [...models].filter(m => m.math_index != null).sort((a,b) => b.math_index! - a.math_index!)
  const byValue  = [...models].filter(m => m.intelligence_index != null && m.price_blended != null && m.price_blended > 0)
    .sort((a,b) => (b.intelligence_index! / b.price_blended!) - (a.intelligence_index! / a.price_blended!))
  const bestOpen = [...models].filter(m => m.open_weight === true && m.intelligence_index != null)
    .sort((a,b) => b.intelligence_index! - a.intelligence_index!)

  const slots = [
    { label: "Best Overall",    model: byIntel[0],  metric: "Intelligence", value: byIntel[0]?.intelligence_index,  accent: "#8b5cf6" },
    { label: "Best Coding",     model: byCoding[0], metric: "Coding Index", value: byCoding[0]?.coding_index,       accent: "#3b82f6" },
    { label: "Best Math",       model: byMath[0],   metric: "Math Index",   value: byMath[0]?.math_index,           accent: "#10b981" },
    { label: "Best Value",      model: byValue[0],  metric: "Intel per $",
      value: byValue[0] ? byValue[0].intelligence_index! / byValue[0].price_blended! : null, accent: "#f59e0b" },
    { label: "Best Open Model", model: bestOpen[0], metric: "Intelligence", value: bestOpen[0]?.intelligence_index, accent: "#f97316", badge: true },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {slots.map((s) => (
        <div key={s.label} className="bg-white rounded-xl border border-slate-200/70 px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.accent }} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
          </div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-sm font-semibold text-slate-900 truncate leading-tight" title={s.model?.name}>
              {s.model?.name ?? "n/a"}
            </p>
            {s.badge && s.model && (
              <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-orange-50 text-orange-600 font-semibold leading-none border border-orange-100">OW</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate">{s.model?.org ?? ""}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums" style={{ color: s.accent }}>
              {s.value != null ? s.value.toFixed(1) : "n/a"}
            </span>
            <span className="text-[10px] text-slate-400">{s.metric}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── SideLeaderboard ───────────────────────────────────────────────────────────

type SideSort = "intelligence_index" | "coding_index" | "math_index" | "price_blended" | "tokens_per_sec"

const SIDE_SORT_OPTS: { key: SideSort; label: string }[] = [
  { key: "intelligence_index", label: "Intel"  },
  { key: "coding_index",       label: "Coding" },
  { key: "math_index",         label: "Math"   },
  { key: "price_blended",      label: "Price"  },
  { key: "tokens_per_sec",     label: "Speed"  },
]

function SideLeaderboard({ models }: { models: ModelRecord[] }) {
  const [sort, setSort] = useState<SideSort>("intelligence_index")
  const [filterOpen, setFilterOpen] = useState<"all" | "open" | "closed">("all")

  const priceAsc = sort === "price_blended"

  const list = [...models]
    .filter(m => {
      if (filterOpen === "open"   && m.open_weight !== true)  return false
      if (filterOpen === "closed" && m.open_weight !== false) return false
      return m[sort] != null
    })
    .sort((a, b) => {
      const av = a[sort] as number
      const bv = b[sort] as number
      return priceAsc ? av - bv : bv - av
    })
    .slice(0, 25)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col"
      style={{ maxHeight: "calc(100vh - 5.5rem)", overflowY: "hidden" }}>
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Leaderboard</h3>
          <Link href="/models/leaderboard" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
            See all →
          </Link>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {SIDE_SORT_OPTS.map(o => (
            <button key={o.key} onClick={() => setSort(o.key)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                sort === o.key ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["all", "open", "closed"] as const).map(v => (
            <button key={v} onClick={() => setFilterOpen(v)}
              className={`px-2 py-0.5 rounded-md text-[11px] capitalize transition-colors ${
                filterOpen === v ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {list.map((m, i) => {
          const val = m[sort] as number
          const display = sort === "price_blended" ? fmtPrice(val) : fmt(val, sort === "tokens_per_sec" ? 0 : 1)
          return (
            <div key={m.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
              <span className="text-[11px] text-slate-400 w-5 shrink-0 tabular-nums text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-800 truncate">{m.name}</span>
                  {m.open_weight === true && (
                    <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-violet-50 text-violet-600 font-semibold leading-none">OW</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 truncate">{m.org}</p>
              </div>
              <span className="text-xs font-semibold tabular-nums text-slate-700 shrink-0">{display}</span>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-100 shrink-0">
        <Link href="/models/leaderboard" className="block text-center text-xs text-violet-600 hover:text-violet-700 font-medium py-1">
          View full leaderboard →
        </Link>
      </div>
    </div>
  )
}

// ── Graph 1: Top 25 Models Horizontal Bar Chart ───────────────────────────────

const BAR_METRICS = [
  { key: "intelligence_index" as const, color: "#8b5cf6", label: "Intelligence",
    desc: "Composite score measuring overall reasoning and language capability across diverse tasks. Source: Artificial Analysis (0–100 scale)." },
  { key: "coding_index" as const, color: "#3b82f6", label: "Coding",
    desc: "Performance across code generation, debugging, and software engineering benchmarks. Source: Artificial Analysis (0–100 scale)." },
  { key: "math_index" as const, color: "#10b981", label: "Math",
    desc: "Mathematical reasoning covering algebra, calculus, and quantitative problem-solving. Source: Artificial Analysis (0–100 scale)." },
]

function TopModelsBarChart({ models }: { models: ModelRecord[] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<typeof BAR_METRICS[number]["key"]>("intelligence_index")

  const metric = BAR_METRICS.find(m => m.key === activeKey)!

  const top15 = [...models]
    .filter(m => m[metric.key] != null)
    .sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number))
    .slice(0, 15)

  const maxScore = top15.length
    ? Math.min(100, Math.ceil(Math.max(...top15.map(m => m[metric.key] as number)) / 5) * 5 + 5)
    : 100

  const W = 820, PAD_L = 200, PAD_T = 16, PAD_B = 44, PAD_R = 64
  const ROW_H = 30, BAR_H = 16
  const plotW = W - PAD_L - PAD_R
  const H = top15.length * ROW_H + PAD_T + PAD_B
  const axisY = PAD_T + top15.length * ROW_H

  const toX = (v: number) => PAD_L + (v / maxScore) * plotW
  const xTicks = Array.from({ length: Math.ceil(maxScore / 10) + 1 }, (_, i) => i * 10).filter(t => t <= maxScore)

  const barFill = (m: ModelRecord) => m.open_weight === true ? metric.color : "#94a3b8"

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-700">Top 15 Models by Capability</h3>
          <p className="text-xs text-slate-400 mt-0.5">{metric.desc}</p>
        </div>
        <div className="flex gap-1 shrink-0 mt-0.5">
          {BAR_METRICS.map(m => (
            <button key={m.key} onClick={() => setActiveKey(m.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
                activeKey === m.key ? "text-white border-transparent" : "text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600"
              }`}
              style={activeKey === m.key ? { backgroundColor: m.color, borderColor: m.color } : {}}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5 mt-2 mb-1">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-2.5 rounded-sm inline-block" style={{ backgroundColor: metric.color }} />
          Open-weight
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-3 h-2.5 rounded-sm inline-block bg-slate-300" />
          Closed / proprietary
        </span>
      </div>

      <div className="overflow-x-auto mt-2">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
          {xTicks.map(t => {
            const x = toX(t)
            return (
              <g key={t}>
                <line x1={x} y1={PAD_T} x2={x} y2={axisY}
                  stroke={t === 0 ? "#e2e8f0" : "#f1f5f9"} strokeWidth={1} />
                <text x={x} y={axisY + 14} textAnchor="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{t}</text>
              </g>
            )
          })}

          {top15.map((m, i) => {
            const val = m[metric.key] as number
            const rowY = PAD_T + i * ROW_H
            const barY = rowY + (ROW_H - BAR_H) / 2
            const isHov = hovered === m.id
            const barW = Math.max(2, (val / maxScore) * plotW)
            return (
              <g key={m.id}
                onMouseEnter={() => setHovered(m.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "default" }}>
                {isHov && (
                  <rect x={0} y={rowY} width={W} height={ROW_H} fill="#f8fafc" rx={2} />
                )}
                {/* Rank number */}
                <text x={10} y={rowY + ROW_H / 2}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize={9} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                  {i + 1}
                </text>
                {/* Model name */}
                <text x={34} y={rowY + ROW_H / 2}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize={9} fill={isHov ? "#1e293b" : "#475569"}
                  fontWeight={isHov ? 600 : 400}
                  fontFamily="ui-sans-serif, system-ui">
                  {truncate(m.name, 27)}
                </text>
                {/* Bar — color by open/closed */}
                <rect x={PAD_L} y={barY} width={barW} height={BAR_H}
                  fill={barFill(m)} fillOpacity={isHov ? 1 : 0.82} rx={2.5} />
                {/* Score label */}
                <text x={PAD_L + barW + 5} y={barY + BAR_H / 2}
                  dominantBaseline="middle" fontSize={9}
                  fill={isHov ? "#334155" : "#94a3b8"}
                  fontFamily="ui-sans-serif, system-ui">
                  {val.toFixed(1)}
                </text>
              </g>
            )
          })}

          {/* Y axis line */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={axisY} stroke="#e2e8f0" strokeWidth={1} />
          {/* X axis bottom line */}
          <line x1={PAD_L} y1={axisY} x2={PAD_L + plotW} y2={axisY} stroke="#e2e8f0" strokeWidth={1} />
          {/* X axis label — below tick numbers with clear separation */}
          <text x={PAD_L + plotW / 2} y={H - 8} textAnchor="middle"
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Score (0 to 100)</text>
        </svg>
      </div>
    </div>
  )
}

// ── Graph 2: Open vs Closed Frontier (hoverable) ──────────────────────────────

type MetricKey = "intelligence_index" | "coding_index" | "math_index"
const METRIC_OPTS: { key: MetricKey; label: string }[] = [
  { key: "intelligence_index", label: "Intelligence" },
  { key: "coding_index",       label: "Coding"       },
  { key: "math_index",         label: "Math"         },
]

type FrontierPt = { date: string; v: number; model: ModelRecord }

function OpenVsClosedFrontier({ models }: { models: ModelRecord[] }) {
  const [metric, setMetric] = useState<MetricKey>("intelligence_index")
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

  const allPts = [...openPts, ...closedPts]
  if (allPts.length === 0) return null

  const W = 820, H = 280, PAD_L = 46, PAD_B = 30, PAD_T = 20, PAD_R = 160
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const minDate = new Date("2023-01-01").getTime()
  const maxDate = Date.now()
  const dateRange = maxDate - minDate

  const allVals  = allPts.map(p => p.v)
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

  function Tooltip({ pt }: { pt: FrontierPt }) {
    const x = toX(pt.date), y = toY(pt.v)
    const tx = x > PAD_L + plotW * 0.6 ? x - 158 : x + 10
    const ty = y < 70 ? y + 8 : y - 62
    return (
      <g>
        <rect x={tx} y={ty} width={150} height={54} rx={4} fill="#0f172a" fillOpacity={0.93} />
        <text x={tx + 7} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
          {truncate(pt.model.name, 22)}
        </text>
        <text x={tx + 7} y={ty + 26} fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
          {pt.model.org}
        </text>
        <text x={tx + 7} y={ty + 38} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
          Score: {pt.v.toFixed(1)}
        </text>
        <text x={tx + 7} y={ty + 49} fontSize={7.5} fill="#64748b" fontFamily="ui-sans-serif, system-ui">
          Released {fmtDate(pt.date)}
        </text>
      </g>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-700">Open vs. Closed Frontier</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Best model score at each point in time. Each step marks a new state-of-the-art. Hover any dot to see which model set the record.
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {METRIC_OPTS.map(o => (
            <button key={o.key} onClick={() => setMetric(o.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                metric === o.key ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6 mb-4">
        <span className="flex items-center gap-2 text-xs text-slate-600">
          <span className="w-6 h-0.5 bg-violet-500 inline-block rounded" />
          Open-weight frontier
          {lastOpen && <span className="text-slate-400 font-normal">({truncate(lastOpen.model.name, 18)})</span>}
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-600">
          <span className="w-6 h-0.5 bg-slate-400 inline-block rounded" />
          Closed frontier
          {lastClosed && <span className="text-slate-400 font-normal">({truncate(lastClosed.model.name, 18)})</span>}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
          {yLabels.map(v => {
            const y = toY(v)
            return (
              <g key={v}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 6} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{v}</text>
              </g>
            )
          })}
          {quarterMarks.map(({ date, label, major }) => {
            const x = PAD_L + ((new Date(date).getTime() - minDate) / dateRange) * plotW
            return (
              <g key={date}>
                {major
                  ? <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
                  : <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#f1f5f9" strokeWidth={1} strokeDasharray="3 3" />
                }
                <text x={x} y={H - 6} textAnchor="middle"
                  fontSize={major ? 9 : 7.5} fontWeight={major ? 500 : 400}
                  fill={major ? "#94a3b8" : "#b8c8d8"}
                  fontFamily="ui-sans-serif, system-ui">{label}</text>
              </g>
            )
          })}

          {closedPts.length > 0 && <path d={stepPath(closedPts)} fill="none" stroke="#94a3b8" strokeWidth={2.5} strokeLinejoin="round" />}
          {openPts.length  > 0 && <path d={stepPath(openPts)}  fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinejoin="round" />}

          {closedPts.map((p, i) => (
            <circle key={`c${i}`} cx={toX(p.date)} cy={toY(p.v)} r={hovClosed === i ? 6 : 4.5}
              fill="white" stroke="#94a3b8" strokeWidth={hovClosed === i ? 2 : 1.5}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovClosed(i)}
              onMouseLeave={() => setHovClosed(null)} />
          ))}
          {openPts.map((p, i) => (
            <circle key={`o${i}`} cx={toX(p.date)} cy={toY(p.v)} r={hovOpen === i ? 6 : 4.5}
              fill="white" stroke="#8b5cf6" strokeWidth={hovOpen === i ? 2 : 1.5}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovOpen(i)}
              onMouseLeave={() => setHovOpen(null)} />
          ))}

          {lastClosed && (
            <text x={PAD_L + plotW + 8} y={toY(lastClosed.v)} dominantBaseline="middle"
              fontSize={8} fill="#64748b" fontWeight={600} fontFamily="ui-sans-serif, system-ui">
              {truncate(lastClosed.model.name, 20)}
            </text>
          )}
          {lastOpen && (
            <text x={PAD_L + plotW + 8} y={toY(lastOpen.v)} dominantBaseline="middle"
              fontSize={8} fill="#7c3aed" fontWeight={600} fontFamily="ui-sans-serif, system-ui">
              {truncate(lastOpen.model.name, 20)}
            </text>
          )}

          {hovPt && <Tooltip pt={hovPt} />}

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Graph 3: Release Timeline (swimlane dots + scatter chart) ─────────────────

function ReleaseTimeline({ models }: { models: ModelRecord[] }) {
  const [viewMode, setViewMode] = useState<"chart" | "swimlane">("chart")
  const [hovered, setHovered] = useState<ModelRecord | null>(null)
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string> | null>(null)

  const minDate = new Date("2023-01-01").getTime()
  const maxDate = Date.now()
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
  const CH = 380, CPAD_L = 64, CPAD_B = 34, CPAD_T = 20, CPAD_R = 20
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

  const ROW_H = 44, PAD_L = 110, PAD_T = 28, PAD_B = 30, PAD_R = 30
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
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-700">Model Release Timeline</h3>
          <p className="text-xs text-slate-400 mt-0.5">
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
                  ? "bg-slate-800 text-white border-slate-800"
                  : "text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600"
              }`}>
              {v === "chart" ? "Chart" : "Swimlane"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "chart" && (
        <div className="mt-2 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Companies</span>
            <button onClick={() => setSelectedOrgs(null)}
              className="text-[10px] text-violet-500 hover:text-violet-700 font-medium transition-colors">All</button>
            <span className="text-slate-200 text-xs">·</span>
            <button onClick={() => setSelectedOrgs(new Set())}
              className="text-[10px] text-slate-400 hover:text-slate-600 font-medium transition-colors">None</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chartOrgs.map(org => {
              const selected = isOrgSelected(org)
              const color = orgColor(org)
              return (
                <button key={org} onClick={() => toggleOrg(org)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                    selected
                      ? "shadow-sm"
                      : "border-slate-200 text-slate-400 bg-white hover:border-slate-300 hover:text-slate-600"
                  }`}
                  style={selected ? {
                    backgroundColor: `${color}15`,
                    borderColor: `${color}55`,
                    color: "#334155",
                  } : {}}>
                  <span className="w-2 h-2 rounded-full shrink-0 transition-colors"
                    style={{ backgroundColor: selected ? color : "#cbd5e1" }} />
                  {org}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === "chart" ? (
        <div className="overflow-x-auto">
          <svg width="100%" viewBox={`0 0 ${W} ${CH}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
            {yTicks.map(v => {
              const y = toChartY(v)
              return (
                <g key={v}>
                  <line x1={CPAD_L} y1={y} x2={CPAD_L + cPlotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                  <text x={CPAD_L - 6} y={y} textAnchor="end" dominantBaseline="middle"
                    fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{Math.round(v)}</text>
                </g>
              )
            })}
            {quarterMarks.map(({ date, label, major }) => {
              const x = toChartX(date)
              return (
                <g key={date}>
                  {major
                    ? <line x1={x} y1={CPAD_T} x2={x} y2={CPAD_T + cPlotH} stroke="#e2e8f0" strokeWidth={1} />
                    : <line x1={x} y1={CPAD_T} x2={x} y2={CPAD_T + cPlotH} stroke="#f1f5f9" strokeWidth={1} strokeDasharray="3 3" />
                  }
                  <text x={x} y={CH - 6} textAnchor="middle"
                    fontSize={major ? 9 : 7.5}
                    fontWeight={major ? 500 : 400}
                    fill={major ? "#94a3b8" : "#b8c8d8"}
                    fontFamily="ui-sans-serif, system-ui">{label}</text>
                </g>
              )
            })}

            {filteredChartModels.map(m => {
              const cx = toChartX(m.release_date!)
              const cy = toChartY(m.intelligence_index!)
              const isHov = hovered?.id === m.id
              return (
                <circle key={m.id} cx={cx} cy={cy} r={isHov ? 6 : 4}
                  fill={orgColor(m.org)} fillOpacity={isHov ? 1 : 0.65}
                  stroke={isHov ? "#0f172a" : "white"} strokeWidth={isHov ? 1.5 : 0.8}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(m)}
                  onMouseLeave={() => setHovered(null)}
                />
              )
            })}

            {hovered && hovered.intelligence_index != null && (() => {
              const cx = toChartX(hovered.release_date!)
              const cy = toChartY(hovered.intelligence_index)
              const tx = cx > W * 0.68 ? cx - 162 : cx + 10
              const ty = cy < 60 ? cy + 8 : cy - 62
              return (
                <g>
                  <rect x={tx} y={ty} width={155} height={54} rx={4} fill="#0f172a" fillOpacity={0.93} />
                  <text x={tx + 7} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                    {truncate(hovered.name, 22)}
                  </text>
                  <text x={tx + 7} y={ty + 26} fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{hovered.org}</text>
                  <text x={tx + 7} y={ty + 38} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                    Intelligence: {hovered.intelligence_index.toFixed(1)}
                  </text>
                  <text x={tx + 7} y={ty + 49} fontSize={7.5} fill="#64748b" fontFamily="ui-sans-serif, system-ui">
                    Released {fmtDate(hovered.release_date)}
                  </text>
                </g>
              )
            })()}

            <line x1={CPAD_L} y1={CPAD_T} x2={CPAD_L} y2={CPAD_T + cPlotH} stroke="#e2e8f0" strokeWidth={1} />
            <line x1={CPAD_L} y1={CPAD_T + cPlotH} x2={CPAD_L + cPlotW} y2={CPAD_T + cPlotH} stroke="#e2e8f0" strokeWidth={1} />
            <text x={14} y={CPAD_T + cPlotH / 2} textAnchor="middle"
              transform={`rotate(-90, 14, ${CPAD_T + cPlotH / 2})`}
              fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Intelligence Index</text>
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
                    ? <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + topOrgs.length * ROW_H} stroke="#e2e8f0" strokeWidth={1} />
                    : <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + topOrgs.length * ROW_H} stroke="#f1f5f9" strokeWidth={1} strokeDasharray="3 3" />
                  }
                  <text x={x} y={swimH - 6} textAnchor="middle"
                    fontSize={major ? 9 : 7.5} fontWeight={major ? 500 : 400}
                    fill={major ? "#94a3b8" : "#b8c8d8"}
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
                    stroke="#f1f5f9" strokeWidth={1} />
                  <text x={PAD_L - 8} y={rowY + ROW_H / 2} textAnchor="end" dominantBaseline="middle"
                    fontSize={9} fill="#475569" fontWeight={500} fontFamily="ui-sans-serif, system-ui">
                    {truncate(org, 16)}
                  </text>
                  <text x={PAD_L - 70} y={rowY + ROW_H / 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                    {orgModels.length}
                  </text>
                  {orgModels.map(m => {
                    const x = toSwimlaneX(m.release_date!)
                    const y = rowY + ROW_H / 2
                    const isHov = hovered?.id === m.id
                    return (
                      <circle key={m.id} cx={x} cy={y} r={isHov ? 6 : 4}
                        fill={color} fillOpacity={isHov ? 1 : 0.7}
                        stroke={isHov ? "#0f172a" : "white"} strokeWidth={isHov ? 1.5 : 1}
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
              const tx = x > W * 0.68 ? x - 162 : x + 10
              const ty = y - 42
              return (
                <g>
                  <rect x={tx} y={ty} width={155} height={54} rx={4} fill="#0f172a" fillOpacity={0.93} />
                  <text x={tx + 7} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                    {truncate(hovered.name, 22)}
                  </text>
                  <text x={tx + 7} y={ty + 26} fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{hovered.org}</text>
                  <text x={tx + 7} y={ty + 38} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                    Released: {fmtDate(hovered.release_date)}
                  </text>
                  {hovered.intelligence_index != null && (
                    <text x={tx + 7} y={ty + 49} fontSize={7.5} fill="#64748b" fontFamily="ui-sans-serif, system-ui">
                      Intelligence: {hovered.intelligence_index.toFixed(1)}
                    </text>
                  )}
                </g>
              )
            })()}

            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + topOrgs.length * ROW_H}
              stroke="#e2e8f0" strokeWidth={1} />
          </svg>
        </div>
      )}
    </div>
  )
}

// ── Graph 4: Cost vs Intelligence (top 20 + by-company view) ─────────────────

function CostScatter({ models }: { models: ModelRecord[] }) {
  const [hovered, setHovered] = useState<ModelRecord | null>(null)
  const [viewMode, setViewMode] = useState<"open-closed" | "by-company">("open-closed")

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

  const plotModels = viewMode === "by-company" ? topByCompany : [...topOpen, ...topClosed]
  if (plotModels.length === 0) return null

  const W = 820, H = 300, PAD_L = 58, PAD_B = 38, PAD_T = 16, PAD_R = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const prices = plotModels.map(m => m.price_blended!)
  const intels = plotModels.map(m => m.intelligence_index!)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const logMin = Math.log10(Math.max(minP, 0.001))
  const logMax = Math.log10(maxP)
  const minI = Math.min(...intels), maxI = Math.max(...intels)

  const toX = (v: number) => PAD_L + ((v - minI) / (maxI - minI || 1)) * plotW
  const toY = (p: number) => PAD_T + (1 - (Math.log10(Math.max(p, 0.001)) - logMin) / (logMax - logMin || 1)) * plotH

  const yTicks = [0.001, 0.01, 0.1, 0.5, 1, 5, 15, 50, 150].filter(t => t >= minP * 0.4 && t <= maxP * 2.5)

  const dotColor = (m: ModelRecord) =>
    viewMode === "by-company" ? orgColor(m.org) : (m.open_weight === true ? "#a78bfa" : "#94a3b8")

  const uniqueOrgs = viewMode === "by-company"
    ? [...new Set(topByCompany.map(m => m.org))].sort()
    : []

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-700">Cost vs. Capability</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {viewMode === "open-closed"
              ? "Top 10 open-weight and top 10 closed models by Intelligence Index. Price axis uses a log scale (blended per 1M tokens). Hover a dot for details."
              : "Top 30 models with pricing data, colored by company. Price axis uses a log scale. Hover a dot for details."
            }
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setViewMode("open-closed")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              viewMode === "open-closed"
                ? "bg-slate-800 text-white border-slate-800"
                : "text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600"
            }`}>Open / Closed</button>
          <button onClick={() => setViewMode("by-company")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              viewMode === "by-company"
                ? "bg-slate-800 text-white border-slate-800"
                : "text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600"
            }`}>By Company</button>
        </div>
      </div>

      {viewMode === "open-closed" ? (
        <div className="flex items-center gap-5 mt-3 mb-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" /> Open-weight (top 10)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Closed (top 10)
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 mb-2">
          {uniqueOrgs.map(org => (
            <span key={org} className="flex items-center gap-1.5 text-xs text-slate-600">
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
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                  ${t < 1 ? t.toFixed(t < 0.01 ? 3 : 2) : t}
                </text>
              </g>
            )
          })}

          {plotModels.map(m => {
            const x = toX(m.intelligence_index!), y = toY(m.price_blended!)
            const isHov = hovered?.id === m.id
            return (
              <g key={m.id}>
                <circle cx={x} cy={y} r={isHov ? 7 : 5}
                  fill={dotColor(m)} fillOpacity={isHov ? 1 : 0.8}
                  stroke={isHov ? "#0f172a" : "white"} strokeWidth={isHov ? 1.5 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(m)}
                  onMouseLeave={() => setHovered(null)} />
              </g>
            )
          })}

          {hovered && (() => {
            const x = toX(hovered.intelligence_index!), y = toY(hovered.price_blended!)
            const tx = x > W * 0.68 ? x - 158 : x + 10
            const ty = y < 60 ? y + 8 : y - 62
            return (
              <g>
                <rect x={tx} y={ty} width={150} height={54} rx={4} fill="#0f172a" fillOpacity={0.93} />
                <text x={tx + 7} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                  {truncate(hovered.name, 22)}
                </text>
                <text x={tx + 7} y={ty + 26} fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                  {hovered.org} {hovered.open_weight ? "(open)" : "(closed)"}
                </text>
                <text x={tx + 7} y={ty + 38} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                  Intelligence: {hovered.intelligence_index?.toFixed(1)}
                </text>
                <text x={tx + 7} y={ty + 49} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                  Price: {fmtPrice(hovered.price_blended)} per 1M tokens
                </text>
              </g>
            )
          })()}

          <text x={PAD_L + plotW / 2} y={H - 4} textAnchor="middle"
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Intelligence Index</text>
          <text x={14} y={PAD_T + plotH / 2} textAnchor="middle"
            transform={`rotate(-90, 14, ${PAD_T + plotH / 2})`}
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Price per 1M tokens (log scale)</text>

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Graph 5: Speed vs Intelligence (top 20 + by-company view) ────────────────

function SpeedVsIntelligence({ models }: { models: ModelRecord[] }) {
  const [hovered, setHovered] = useState<ModelRecord | null>(null)
  const [viewMode, setViewMode] = useState<"open-closed" | "by-company">("open-closed")

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

  const plotModels = viewMode === "by-company" ? topByCompany : [...topOpen, ...topClosed]
  if (plotModels.length === 0) return null

  const W = 820, H = 300, PAD_L = 60, PAD_B = 38, PAD_T = 16, PAD_R = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const intels = plotModels.map(m => m.intelligence_index!)
  const speeds = plotModels.map(m => m.tokens_per_sec!)
  const minI = Math.min(...intels), maxI = Math.max(...intels)
  const minS = 0, maxS = Math.max(...speeds) * 1.08

  const toX = (v: number) => PAD_L + ((v - minI) / (maxI - minI || 1)) * plotW
  const toY = (v: number) => PAD_T + (1 - (v - minS) / (maxS - minS || 1)) * plotH

  const yTicks = [0, 25, 50, 100, 200, 400, 800, 1500, 3000].filter(t => t <= maxS * 1.1)
  const xStep  = Math.ceil((maxI - minI) / 5 / 5) * 5 || 5
  const xTicks = Array.from({ length: 7 }, (_, i) => Math.round(minI + i * xStep)).filter(t => t <= maxI + 1)

  const dotColor = (m: ModelRecord) =>
    viewMode === "by-company" ? orgColor(m.org) : (m.open_weight === true ? "#a78bfa" : "#94a3b8")

  const uniqueOrgs = viewMode === "by-company"
    ? [...new Set(topByCompany.map(m => m.org))].sort()
    : []

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-700">Speed vs. Intelligence</h3>
          <p className="text-xs text-slate-400 mt-0.5">
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
                ? "bg-slate-800 text-white border-slate-800"
                : "text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600"
            }`}>Open / Closed</button>
          <button onClick={() => setViewMode("by-company")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
              viewMode === "by-company"
                ? "bg-slate-800 text-white border-slate-800"
                : "text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600"
            }`}>By Company</button>
        </div>
      </div>

      {viewMode === "open-closed" ? (
        <div className="flex items-center gap-5 mt-3 mb-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" /> Open-weight (top 10)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Closed (top 10)
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 mb-2">
          {uniqueOrgs.map(org => (
            <span key={org} className="flex items-center gap-1.5 text-xs text-slate-600">
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
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{t}</text>
              </g>
            )
          })}
          {xTicks.map(t => {
            const x = toX(t)
            return (
              <g key={t}>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#f8fafc" strokeWidth={1} />
                <text x={x} y={H - 8} textAnchor="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{t}</text>
              </g>
            )
          })}

          {plotModels.map(m => {
            const x = toX(m.intelligence_index!), y = toY(m.tokens_per_sec!)
            const isHov = hovered?.id === m.id
            return (
              <g key={m.id}>
                <circle cx={x} cy={y} r={isHov ? 7 : 5}
                  fill={dotColor(m)} fillOpacity={isHov ? 1 : 0.8}
                  stroke={isHov ? "#0f172a" : "white"} strokeWidth={isHov ? 1.5 : 1}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(m)}
                  onMouseLeave={() => setHovered(null)} />
              </g>
            )
          })}

          {hovered && (() => {
            const x = toX(hovered.intelligence_index!), y = toY(hovered.tokens_per_sec!)
            const tx = x > W * 0.68 ? x - 158 : x + 10
            const ty = y < 60 ? y + 8 : y - 62
            return (
              <g>
                <rect x={tx} y={ty} width={150} height={54} rx={4} fill="#0f172a" fillOpacity={0.93} />
                <text x={tx + 7} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                  {truncate(hovered.name, 22)}
                </text>
                <text x={tx + 7} y={ty + 26} fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                  {hovered.org} {hovered.open_weight ? "(open)" : "(closed)"}
                </text>
                <text x={tx + 7} y={ty + 38} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                  Intelligence: {hovered.intelligence_index?.toFixed(1)}
                </text>
                <text x={tx + 7} y={ty + 49} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                  Speed: {hovered.tokens_per_sec?.toFixed(0)} tokens/sec
                </text>
              </g>
            )
          })()}

          <text x={PAD_L + plotW / 2} y={H - 4} textAnchor="middle"
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Intelligence Index</text>
          <text x={14} y={PAD_T + plotH / 2} textAnchor="middle"
            transform={`rotate(-90, 14, ${PAD_T + plotH / 2})`}
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Output speed (tokens per second)</text>

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Geographic Distribution ───────────────────────────────────────────────────

function GeographyChart({ models }: { models: ModelRecord[] }) {
  const counts: Record<string, { open: number; closed: number }> = {}
  for (const m of models) {
    const c = m.country || "Unknown"
    if (!counts[c]) counts[c] = { open: 0, closed: 0 }
    if (m.open_weight === true) counts[c].open++
    else counts[c].closed++
  }

  const sorted = Object.entries(counts)
    .map(([country, { open, closed }]) => ({ country, open, closed, total: open + closed }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const maxTotal = Math.max(...sorted.map(d => d.total), 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <h3 className="text-sm font-semibold text-slate-700">Geographic Distribution</h3>
      <p className="text-xs text-slate-400 mt-0.5">Models by country of origin, split by open-weight vs. proprietary.</p>

      <div className="flex items-center gap-4 mt-3 mb-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Closed / proprietary
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block" /> Open-weight
        </span>
      </div>

      <div className="space-y-2.5">
        {sorted.map(d => {
          const closedW = (d.closed / maxTotal) * 100
          const openW   = (d.open   / maxTotal) * 100
          return (
            <div key={d.country} className="flex items-center gap-3">
              <span className="text-xs text-slate-600 w-32 shrink-0 text-right font-medium">{d.country}</span>
              <div className="flex-1 flex rounded overflow-hidden h-5 bg-slate-50">
                {d.closed > 0 && (
                  <div className="bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-500 shrink-0"
                    style={{ width: `${closedW}%` }}>
                    {closedW > 7 ? d.closed : ""}
                  </div>
                )}
                {d.open > 0 && (
                  <div className="bg-violet-300 flex items-center justify-center text-[10px] font-medium text-violet-700 shrink-0"
                    style={{ width: `${openW}%` }}>
                    {openW > 7 ? d.open : ""}
                  </div>
                )}
              </div>
              <span className="text-xs font-semibold text-slate-700 w-8 tabular-nums text-right">{d.total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TrueSkill Domain Rankings (bottom) ───────────────────────────────────────

function DomainRankings({ rankings }: { rankings: ModelsData["rankings"] }) {
  const tabs = Object.keys(rankings).filter(k => rankings[k]?.models?.length > 0).sort()
  const [active, setActive] = useState(tabs[0] ?? "")

  const ranked: RankedModel[] = rankings[active]?.models?.slice(0, 10) ?? []
  const maxScore = ranked.length ? Math.max(...ranked.map(m => m.score)) : 1
  const minScore = ranked.length ? Math.min(...ranked.map(m => m.score)) : 0
  const range    = maxScore - minScore || 1

  const tabLabel = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <h3 className="text-sm font-semibold text-slate-700">TrueSkill Domain Rankings</h3>
      <p className="text-xs text-slate-400 mt-0.5">
        Rankings from pairwise head-to-head comparisons across {tabs.length} domains (source: LLM Stats).
        A higher score means the model consistently outperformed peers in that domain.
        Bar widths show the relative performance gap within the selected domain only.
      </p>

      <div className="flex flex-wrap gap-1.5 mt-4 mb-5">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActive(tab)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              active === tab
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            }`}>
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {ranked.map(m => {
          const rel    = (m.score - minScore) / range
          const barPct = Math.max(8, Math.round(rel * 100))
          return (
            <div key={m.model_id} className="flex items-center gap-3">
              <span className="text-[11px] tabular-nums text-slate-400 w-5 text-right shrink-0 font-semibold">{m.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-slate-800 truncate">{m.model_name}</span>
                  {m.open_weight && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium border border-violet-100">open</span>
                  )}
                  {m.min_input_price != null && m.min_input_price > 0 && (
                    <span className="shrink-0 text-[10px] text-slate-400 ml-auto tabular-nums">
                      ${(m.min_input_price / 1_000_000).toFixed(2)}/1M
                    </span>
                  )}
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${barPct}%` }} />
                </div>
              </div>
              <span className="text-[11px] tabular-nums text-slate-500 w-12 text-right shrink-0 font-mono">
                {m.score.toFixed(3)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function FrontierModels({ data, builtAt }: { data: ModelsData; builtAt: string | null }) {
  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Frontier Model Tracking</h1>
          <MetadataStrip data={data} builtAt={builtAt} />
        </div>
        <RefreshButton builtAt={builtAt} />
      </div>

      <div className="flex gap-6 items-start">
        {/* LEFT: sticky leaderboard sidebar */}
        <div className="w-72 xl:w-80 shrink-0 sticky top-[3.75rem]">
          <SideLeaderboard models={data.models} />
        </div>

        {/* RIGHT: all content stacked */}
        <div className="flex-1 min-w-0 space-y-5">
          <BestInClass models={data.models} />
          <TopModelsBarChart models={data.models} />
          <OpenVsClosedFrontier models={data.models} />
          <ReleaseTimeline models={data.models} />
          <CostScatter models={data.models} />
          <SpeedVsIntelligence models={data.models} />
          <GeographyChart models={data.models} />
          <DomainRankings rankings={data.rankings} />
        </div>
      </div>
    </div>
  )
}
