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
const DEFAULT_COLOR = "#94a3b8"
function orgColor(org: string) { return ORG_COLORS[org] ?? DEFAULT_COLOR }

function fmt(n: number | null, dec = 1): string {
  if (n == null) return "—"
  return n.toFixed(dec)
}
function fmtPrice(n: number | null): string {
  if (n == null) return "—"
  if (n < 0.01) return `$${n.toFixed(3)}`
  if (n < 1)    return `$${n.toFixed(2)}`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string | null): string {
  if (!d) return "—"
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) }
  catch { return d }
}

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
          {status.state === "done"  && <p className="mt-2 text-xs text-green-400 font-mono">✓ Complete — reloading…</p>}
        </div>
      )}
    </div>
  )
}

// ── MetadataStrip ─────────────────────────────────────────────────────────────

function MetadataStrip({ data: _data, builtAt: _builtAt }: { data: ModelsData; builtAt: string | null }) {
  return (
    <p className="text-xs text-slate-400 mt-1">
      Data sourced from{" "}
      <span className="text-slate-600 font-medium">Artificial Analysis</span>
      {" "}and{" "}
      <span className="text-slate-600 font-medium">LLM Stats</span>
    </p>
  )
}

// ── BestInClass ───────────────────────────────────────────────────────────────

function BestInClass({ models }: { models: ModelRecord[] }) {
  const byIntel   = [...models].filter(m => m.intelligence_index != null).sort((a,b) => b.intelligence_index! - a.intelligence_index!)
  const byCoding  = [...models].filter(m => m.coding_index != null).sort((a,b) => b.coding_index! - a.coding_index!)
  const byMath    = [...models].filter(m => m.math_index != null).sort((a,b) => b.math_index! - a.math_index!)
  const byValue   = [...models].filter(m => m.intelligence_index != null && m.price_blended != null && m.price_blended > 0)
    .sort((a,b) => (b.intelligence_index! / b.price_blended!) - (a.intelligence_index! / a.price_blended!))
  const bestOpen  = [...models].filter(m => m.open_weight === true && m.intelligence_index != null)
    .sort((a,b) => b.intelligence_index! - a.intelligence_index!)

  const slots = [
    { label: "Best Overall",    model: byIntel[0],  metric: "Intelligence", value: byIntel[0]?.intelligence_index,  accent: "#8b5cf6" },
    { label: "Best Coding",     model: byCoding[0], metric: "Coding Index", value: byCoding[0]?.coding_index,       accent: "#3b82f6" },
    { label: "Best Math",       model: byMath[0],   metric: "Math Index",   value: byMath[0]?.math_index,           accent: "#10b981" },
    {
      label: "Best Value",
      model: byValue[0],
      metric: "Intel ÷ $/1M",
      value: byValue[0] ? byValue[0].intelligence_index! / byValue[0].price_blended! : null,
      accent: "#f59e0b",
    },
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
              {s.model?.name ?? "—"}
            </p>
            {s.badge && s.model && (
              <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-orange-50 text-orange-600 font-semibold leading-none border border-orange-100">OW</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 truncate">{s.model?.org ?? ""}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums" style={{ color: s.accent }}>
              {s.value != null ? s.value.toFixed(1) : "—"}
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
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Leaderboard</h3>
          <Link href="/models/leaderboard"
            className="text-xs text-violet-600 hover:text-violet-700 font-medium">
            See all →
          </Link>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {SIDE_SORT_OPTS.map(o => (
            <button key={o.key} onClick={() => setSort(o.key)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                sort === o.key
                  ? "bg-violet-100 text-violet-700"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["all", "open", "closed"] as const).map(v => (
            <button key={v} onClick={() => setFilterOpen(v)}
              className={`px-2 py-0.5 rounded-md text-[11px] capitalize transition-colors ${
                filterOpen === v
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {list.map((m, i) => {
          const val = m[sort] as number
          const display = sort === "price_blended"
            ? fmtPrice(val)
            : fmt(val, sort === "tokens_per_sec" ? 0 : 1)
          return (
            <div key={m.id}
              className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
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
        <Link href="/models/leaderboard"
          className="block text-center text-xs text-violet-600 hover:text-violet-700 font-medium py-1">
          View full leaderboard →
        </Link>
      </div>
    </div>
  )
}

// ── Open vs Closed Frontier Over Time ────────────────────────────────────────

type MetricKey = "intelligence_index" | "coding_index" | "math_index"
const METRIC_OPTS: { key: MetricKey; label: string }[] = [
  { key: "intelligence_index", label: "Intelligence" },
  { key: "coding_index",       label: "Coding"       },
  { key: "math_index",         label: "Math"         },
]

function OpenVsClosedOverTime({ models }: { models: ModelRecord[] }) {
  const [metric, setMetric] = useState<MetricKey>("intelligence_index")

  const valid = [...models]
    .filter(m => m.release_date && m[metric] != null && m.release_date >= "2023-01-01")
    .sort((a, b) => (a.release_date! < b.release_date! ? -1 : 1))

  // Build frontier (running best-to-date) for open and closed separately
  let bestOpen = 0, bestClosed = 0
  const openPts:   { date: string; v: number }[] = []
  const closedPts: { date: string; v: number }[] = []

  for (const m of valid) {
    const score = m[metric] as number
    if (m.open_weight === true) {
      if (score > bestOpen) { bestOpen = score; openPts.push({ date: m.release_date!, v: score }) }
    } else {
      if (score > bestClosed) { bestClosed = score; closedPts.push({ date: m.release_date!, v: score }) }
    }
  }

  const allPts = [...openPts, ...closedPts]
  if (allPts.length === 0) return null

  const W = 800, H = 260, PAD_L = 46, PAD_B = 30, PAD_T = 16, PAD_R = 20
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const minDate = new Date("2023-01-01").getTime()
  const maxDate = Date.now()
  const dateRange = maxDate - minDate

  const allVals = allPts.map(p => p.v)
  const rawMin = Math.min(...allVals)
  const rawMax = Math.max(...allVals)
  const pad = (rawMax - rawMin) * 0.1
  const minV = Math.max(0, rawMin - pad)
  const maxV = rawMax + pad
  const valRange = maxV - minV || 1

  const toX = (d: string) => PAD_L + ((new Date(d).getTime() - minDate) / dateRange) * plotW
  const toY = (v: number) => PAD_T + (1 - (v - minV) / valRange) * plotH

  function stepPath(pts: { date: string; v: number }[]): string {
    if (!pts.length) return ""
    let d = `M ${toX(pts[0].date)} ${toY(pts[0].v)}`
    for (let i = 1; i < pts.length; i++) {
      d += ` H ${toX(pts[i].date)} V ${toY(pts[i].v)}`
    }
    d += ` H ${PAD_L + plotW}`
    return d
  }

  const years = [2023, 2024, 2025, 2026].filter(y => {
    const t = new Date(`${y}-01-01`).getTime()
    return t > minDate && t < maxDate
  })
  const yLabels = [10, 20, 30, 40, 50, 60, 70, 80, 90].filter(v => v >= minV - 1 && v <= maxV + 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Open vs. Closed Frontier</h3>
          <p className="text-xs text-slate-400 mt-0.5">Best model score over time — each step marks a new state-of-the-art</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {METRIC_OPTS.map(o => (
            <button key={o.key} onClick={() => setMetric(o.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                metric === o.key
                  ? "bg-violet-100 text-violet-700"
                  : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5 mb-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-5 h-0.5 bg-violet-500 inline-block rounded" /> Open-weight frontier
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-5 h-0.5 bg-slate-400 inline-block rounded" /> Closed frontier
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
          {yLabels.map(v => {
            const y = toY(v)
            return (
              <g key={v}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{v}</text>
              </g>
            )
          })}
          {years.map(y => {
            const x = PAD_L + ((new Date(`${y}-01-01`).getTime() - minDate) / dateRange) * plotW
            return (
              <g key={y}>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke="#f1f5f9" strokeWidth={1} strokeDasharray="3 3" />
                <text x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{y}</text>
              </g>
            )
          })}

          {closedPts.length > 0 && <path d={stepPath(closedPts)} fill="none" stroke="#94a3b8" strokeWidth={2.5} strokeLinejoin="round" />}
          {openPts.length  > 0 && <path d={stepPath(openPts)}  fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinejoin="round" />}

          {closedPts.map((p, i) => (
            <circle key={`c${i}`} cx={toX(p.date)} cy={toY(p.v)} r={3.5} fill="white" stroke="#94a3b8" strokeWidth={1.5} />
          ))}
          {openPts.map((p, i) => (
            <circle key={`o${i}`} cx={toX(p.date)} cy={toY(p.v)} r={3.5} fill="white" stroke="#8b5cf6" strokeWidth={1.5} />
          ))}

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Release Timeline (line chart) ─────────────────────────────────────────────

function ReleaseTimeline({ models }: { models: ModelRecord[] }) {
  const qCounts: Record<string, { open: number; closed: number }> = {}
  for (const m of models) {
    if (!m.release_date) continue
    const d = new Date(m.release_date)
    if (isNaN(d.getTime()) || d.getFullYear() < 2023) continue
    const q = `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`
    if (!qCounts[q]) qCounts[q] = { open: 0, closed: 0 }
    if (m.open_weight === true) qCounts[q].open++
    else qCounts[q].closed++
  }

  const sortedQ = Object.keys(qCounts).sort()
  let cumOpen = 0, cumClosed = 0
  const data = sortedQ.map(q => {
    cumOpen   += qCounts[q].open
    cumClosed += qCounts[q].closed
    return { q, cumOpen, cumClosed, total: cumOpen + cumClosed }
  })

  if (data.length < 2) return null

  const W = 800, H = 220, PAD_L = 46, PAD_B = 30, PAD_T = 16, PAD_R = 20
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const maxTotal = Math.max(...data.map(d => d.total), 1)

  const toX = (i: number) => PAD_L + (i / (data.length - 1)) * plotW
  const toY = (v: number) => PAD_T + (1 - v / maxTotal) * plotH

  function linePath(vals: number[]): string {
    return vals.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ")
  }

  const yStep = Math.ceil(maxTotal / 4 / 25) * 25
  const yLabels = Array.from({ length: 5 }, (_, i) => i * yStep).filter(v => v <= maxTotal + yStep)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Model Release Timeline</h3>
      <p className="text-xs text-slate-400 mb-3">Cumulative models tracked by quarter (2023–present)</p>

      <div className="flex items-center gap-5 mb-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-5 h-0.5 bg-slate-400 inline-block rounded" /> All models
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-5 h-0.5 bg-violet-500 inline-block rounded" /> Open-weight
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
          {yLabels.map(v => {
            const y = toY(v)
            if (y < PAD_T - 2 || y > PAD_T + plotH + 2) return null
            return (
              <g key={v}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{v}</text>
              </g>
            )
          })}

          {/* Area fills */}
          <path
            d={`${linePath(data.map(d => d.total))} L ${toX(data.length - 1)} ${PAD_T + plotH} L ${PAD_L} ${PAD_T + plotH} Z`}
            fill="#e2e8f0" fillOpacity={0.5}
          />
          <path
            d={`${linePath(data.map(d => d.cumOpen))} L ${toX(data.length - 1)} ${PAD_T + plotH} L ${PAD_L} ${PAD_T + plotH} Z`}
            fill="#8b5cf6" fillOpacity={0.12}
          />

          {/* Lines */}
          <path d={linePath(data.map(d => d.total))}   fill="none" stroke="#94a3b8" strokeWidth={2.5} strokeLinejoin="round" />
          <path d={linePath(data.map(d => d.cumOpen))} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinejoin="round" />

          {/* X labels every other quarter */}
          {data.map((d, i) => i % 2 === 0 ? (
            <text key={d.q} x={toX(i)} y={H - 6} textAnchor="middle"
              fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{d.q}</text>
          ) : null)}

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Cost vs Capability ────────────────────────────────────────────────────────

function CostScatter({ models }: { models: ModelRecord[] }) {
  const [hovered, setHovered] = useState<ModelRecord | null>(null)

  const plotModels = models.filter(m => m.intelligence_index != null && m.price_blended != null && m.price_blended > 0)

  const W = 800, H = 280, PAD_L = 52, PAD_B = 36, PAD_T = 16, PAD_R = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const prices  = plotModels.map(m => m.price_blended!)
  const intels  = plotModels.map(m => m.intelligence_index!)
  const minP    = Math.min(...prices), maxP = Math.max(...prices)
  const logMin  = Math.log10(Math.max(minP, 0.001))
  const logMax  = Math.log10(maxP)
  const minI    = Math.min(...intels), maxI = Math.max(...intels)

  const toX = (v: number) => PAD_L + ((v - minI) / (maxI - minI || 1)) * plotW
  const toY = (p: number) => PAD_T + (1 - (Math.log10(Math.max(p, 0.001)) - logMin) / (logMax - logMin || 1)) * plotH

  const yTicks = [0.01, 0.1, 0.5, 1, 5, 15, 50, 150].filter(t => t >= minP * 0.4 && t <= maxP * 2.5)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Cost vs. Capability</h3>
      <p className="text-xs text-slate-400 mb-4">Blended price per 1M tokens (log scale) vs. Intelligence Index — hover for details</p>

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
          {yTicks.map(t => {
            const y = toY(t)
            if (y < PAD_T || y > PAD_T + plotH) return null
            return (
              <g key={t}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                  ${t < 1 ? t.toFixed(t < 0.1 ? 3 : 2) : t}
                </text>
              </g>
            )
          })}

          {plotModels.map(m => {
            const x = toX(m.intelligence_index!), y = toY(m.price_blended!)
            const isHov = hovered?.id === m.id
            return (
              <circle key={m.id} cx={x} cy={y} r={isHov ? 5.5 : 3.5}
                fill={orgColor(m.org)} fillOpacity={0.8}
                stroke={isHov ? "#0f172a" : "white"} strokeWidth={0.5}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHovered(m)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}

          {hovered && (() => {
            const x = toX(hovered.intelligence_index!), y = toY(hovered.price_blended!)
            const tx = x > W * 0.7 ? x - 148 : x + 8
            const ty = y < 50 ? y + 8 : y - 56
            return (
              <g>
                <rect x={tx} y={ty} width={140} height={48} rx={4} fill="#0f172a" fillOpacity={0.92} />
                <text x={tx + 6} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                  {hovered.name.length > 22 ? hovered.name.slice(0, 20) + "…" : hovered.name}
                </text>
                <text x={tx + 6} y={ty + 25} fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{hovered.org}</text>
                <text x={tx + 6} y={ty + 38} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                  Intel: {fmt(hovered.intelligence_index)} · {fmtPrice(hovered.price_blended)}/1M
                </text>
              </g>
            )
          })()}

          <text x={PAD_L + plotW / 2} y={H - 4} textAnchor="middle"
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Intelligence Index →</text>

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(ORG_COLORS).map(([org, color]) => (
          <span key={org} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />{org}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full inline-block shrink-0 bg-slate-400" />Other
        </span>
      </div>
    </div>
  )
}

// ── Speed vs Intelligence ─────────────────────────────────────────────────────

function SpeedVsIntelligence({ models }: { models: ModelRecord[] }) {
  const [hovered, setHovered] = useState<ModelRecord | null>(null)

  const plotModels = models.filter(m => m.intelligence_index != null && m.tokens_per_sec != null && m.tokens_per_sec > 0)
  if (plotModels.length === 0) return null

  const W = 800, H = 280, PAD_L = 56, PAD_B = 36, PAD_T = 16, PAD_R = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const intels = plotModels.map(m => m.intelligence_index!)
  const speeds = plotModels.map(m => m.tokens_per_sec!)
  const minI = Math.min(...intels), maxI = Math.max(...intels)
  const minS = 0, maxS = Math.max(...speeds) * 1.05

  const toX = (v: number) => PAD_L + ((v - minI) / (maxI - minI || 1)) * plotW
  const toY = (v: number) => PAD_T + (1 - (v - minS) / (maxS - minS || 1)) * plotH

  const yTicks = [0, 25, 50, 100, 200, 400, 800, 1500, 3000].filter(t => t <= maxS)
  const xStep = Math.ceil((maxI - minI) / 6 / 5) * 5
  const xTicks = Array.from({ length: 7 }, (_, i) => Math.round(minI + i * xStep)).filter(t => t <= maxI + 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Speed vs. Intelligence</h3>
      <p className="text-xs text-slate-400 mb-4">Tokens per second vs. Intelligence Index — hover a dot for details</p>

      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
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
              <circle key={m.id} cx={x} cy={y} r={isHov ? 5.5 : 3.5}
                fill={orgColor(m.org)} fillOpacity={0.8}
                stroke={isHov ? "#0f172a" : "white"} strokeWidth={0.5}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHovered(m)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}

          {hovered && (() => {
            const x = toX(hovered.intelligence_index!), y = toY(hovered.tokens_per_sec!)
            const tx = x > W * 0.7 ? x - 148 : x + 8
            const ty = y < 50 ? y + 8 : y - 56
            return (
              <g>
                <rect x={tx} y={ty} width={140} height={48} rx={4} fill="#0f172a" fillOpacity={0.92} />
                <text x={tx + 6} y={ty + 14} fontSize={9} fontWeight={600} fill="white" fontFamily="ui-sans-serif, system-ui">
                  {hovered.name.length > 22 ? hovered.name.slice(0, 20) + "…" : hovered.name}
                </text>
                <text x={tx + 6} y={ty + 25} fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">{hovered.org}</text>
                <text x={tx + 6} y={ty + 38} fontSize={8} fill="#cbd5e1" fontFamily="ui-sans-serif, system-ui">
                  Intel: {fmt(hovered.intelligence_index)} · {fmt(hovered.tokens_per_sec, 0)} tok/s
                </text>
              </g>
            )
          })()}

          <text x={PAD_L + plotW / 2} y={H - 3} textAnchor="middle"
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Intelligence Index →</text>
          <text x={12} y={PAD_T + plotH / 2} textAnchor="middle"
            transform={`rotate(-90, 12, ${PAD_T + plotH / 2})`}
            fontSize={9} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Tokens / sec</text>

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(ORG_COLORS).map(([org, color]) => (
          <span key={org} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />{org}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full inline-block shrink-0 bg-slate-400" />Other
        </span>
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
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Geographic Distribution</h3>
      <p className="text-xs text-slate-400 mb-4">Models by country of origin</p>

      <div className="flex items-center gap-4 mb-4">
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

// ── Domain Rankings (TrueSkill, at bottom) ────────────────────────────────────

function DomainRankings({ rankings }: { rankings: ModelsData["rankings"] }) {
  const tabs = Object.keys(rankings)
    .filter(k => rankings[k]?.models?.length > 0)
    .sort()
  const [active, setActive] = useState(tabs[0] ?? "")

  const ranked: RankedModel[] = rankings[active]?.models?.slice(0, 10) ?? []
  const maxScore = ranked.length ? Math.max(...ranked.map(m => m.score)) : 1
  const minScore = ranked.length ? Math.min(...ranked.map(m => m.score)) : 0
  const range    = maxScore - minScore || 1

  const tabLabel = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">TrueSkill Domain Rankings</h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-lg">
            Rankings from pairwise head-to-head comparisons across {tabs.length} domains. A higher score means the model
            consistently won against peers in that domain. Bar widths show the relative gap — not absolute scores.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5 mt-3">
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
          const rel = (m.score - minScore) / range
          const barPct = Math.max(8, Math.round(rel * 100))
          return (
            <div key={m.model_id} className="flex items-center gap-3">
              <span className="text-[11px] tabular-nums text-slate-400 w-5 text-right shrink-0 font-semibold">{m.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-slate-800 truncate">{m.model_name}</span>
                  {m.open_weight && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium border border-violet-100">
                      open
                    </span>
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

      <p className="mt-4 text-[11px] text-slate-400 border-t border-slate-100 pt-3">
        Source: LLM Stats (TrueSkill algorithm). Scores are domain-specific — a score in "coding" is not comparable to "finance".
        Bar widths show relative standing within the selected domain only.
      </p>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function FrontierModels({ data, builtAt }: { data: ModelsData; builtAt: string | null }) {
  return (
    <div className="w-full">
      {/* Page header — full width */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Frontier Model Tracking</h1>
          <MetadataStrip data={data} builtAt={builtAt} />
        </div>
        <RefreshButton builtAt={builtAt} />
      </div>

      {/* Two-column layout: leaderboard sidebar | main content */}
      <div className="flex gap-6 items-start">
        {/* LEFT: sticky leaderboard sidebar — sticks at navbar height */}
        <div className="w-72 xl:w-80 shrink-0 sticky top-[3.75rem]">
          <SideLeaderboard models={data.models} />
        </div>

        {/* RIGHT: all content stacked */}
        <div className="flex-1 min-w-0 space-y-5">
          <BestInClass models={data.models} />
          <OpenVsClosedOverTime models={data.models} />
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
