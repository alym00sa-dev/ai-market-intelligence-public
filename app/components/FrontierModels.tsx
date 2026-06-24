"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import type { ModelsData, ModelRecord, SpeechData } from "../types"
import SpeechTab from "./SpeechTab"
import CompareTab from "./CompareTab"
import {
  CostScatter, SpeedVsIntelligence, ReleaseTimeline,
  fmtPrice, truncate,
} from "./models/charts"
import { DownloadableNode } from "./ds/DownloadableNode"

function fmt(n: number | null, dec = 1): string {
  if (n == null) return "n/a"
  return n.toFixed(dec)
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
            ? "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border-[var(--border-subtle)] cursor-not-allowed"
            : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:border-[var(--border-medium)]"
        }`}
      >
        <svg className={`w-3.5 h-3.5 ${running ? "animate-spin text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {running ? "Refreshing…" : "Refresh Data"}
      </button>
      {status && (status.state === "done" || status.state === "error" || status.log.length > 1) && (
        <button onClick={() => setShowLog((v) => !v)}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline underline-offset-2">
          {showLog ? "hide log" : "show log"}
        </button>
      )}
      {showLog && status && (
        <div className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[480px] bg-[var(--text-primary)] rounded-xl shadow-2xl border border-[var(--border-medium)] p-4 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-[var(--text-tertiary)] font-semibold">Refresh log</span>
            <button onClick={() => setShowLog(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-tertiary)]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {status.log.map((line, i) => <p key={i} className="text-xs font-mono text-[var(--text-tertiary)]">{line}</p>)}
          </div>
          {status.state === "error" && <p className="mt-2 text-xs text-[var(--accent-red)] font-mono">{status.error}</p>}
          {status.state === "done"  && <p className="mt-2 text-xs text-[var(--accent-green)] font-mono">Complete — reloading…</p>}
        </div>
      )}
    </div>
  )
}

// ── MetadataStrip ─────────────────────────────────────────────────────────────

function MetadataStrip({ data: _data, builtAt }: { data: ModelsData; builtAt: string | null }) {
  return (
    <>
      <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
        Data sourced from{" "}
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Artificial Analysis</span>
        {", "}
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>LLM Stats</span>
        {", and "}
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>HuggingFace</span>
      </div>
      {builtAt && (
        <div
          className="text-[11px] mt-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          Last updated {builtAt}
        </div>
      )}
    </>
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
    { label: "Best Overall",    model: byIntel[0],  metric: "Intelligence", value: byIntel[0]?.intelligence_index,  accent: "#C77F2E" },
    { label: "Best Coding",     model: byCoding[0], metric: "Coding Index", value: byCoding[0]?.coding_index,       accent: "#2C4D9E" },
    { label: "Best Math",       model: byMath[0],   metric: "Math Index",   value: byMath[0]?.math_index,           accent: "#2D8F66" },
    { label: "Best Value",      model: byValue[0],  metric: "Intel per $",
      value: byValue[0] ? byValue[0].intelligence_index! / byValue[0].price_blended! : null, accent: "#C77F2E" },
    { label: "Best Open Model", model: bestOpen[0], metric: "Intelligence", value: bestOpen[0]?.intelligence_index, accent: "#FF6B35", badge: true },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {slots.map((s) => (
        <div key={s.label} className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.accent }} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{s.label}</p>
          </div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight" title={s.model?.name}>
              {s.model?.name ?? "n/a"}
            </p>
            {s.badge && s.model && (
              <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] font-semibold leading-none border border-[var(--accent-amber-bg)]">OW</span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] truncate">{s.model?.org ?? ""}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-lg font-bold tabular-nums" style={{ color: s.accent }}>
              {s.value != null ? s.value.toFixed(1) : "n/a"}
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">{s.metric}</span>
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
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col"
      style={{ maxHeight: "calc(100vh - 5.5rem)", overflowY: "hidden" }}>
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Leaderboard</h3>
          <Link href="/models/leaderboard" className="text-xs text-[var(--accent-amber)] hover:text-[var(--accent-amber)] font-medium">
            See all →
          </Link>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {SIDE_SORT_OPTS.map(o => (
            <button key={o.key} onClick={() => setSort(o.key)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                sort === o.key ? "bg-[var(--accent-amber-bg)] text-[var(--accent-amber)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"
              }`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["all", "open", "closed"] as const).map(v => (
            <button key={v} onClick={() => setFilterOpen(v)}
              className={`px-2 py-0.5 rounded-md text-[11px] capitalize transition-colors ${
                filterOpen === v ? "bg-[var(--text-primary)] text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"
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
            <div key={m.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-base)]/70 transition-colors">
              <span className="text-[11px] text-[var(--text-tertiary)] w-5 shrink-0 tabular-nums text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-primary)] truncate">{m.name}</span>
                  {m.open_weight === true && (
                    <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] font-semibold leading-none">OW</span>
                  )}
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] truncate">{m.org}</p>
              </div>
              <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)] shrink-0">{display}</span>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] shrink-0">
        <Link href="/models/leaderboard" className="block text-center text-xs text-[var(--accent-amber)] hover:text-[var(--accent-amber)] font-medium py-1">
          View full leaderboard →
        </Link>
      </div>
    </div>
  )
}

// ── Graph 1: Top 25 Models Horizontal Bar Chart ───────────────────────────────

const BAR_METRICS = [
  { key: "intelligence_index" as const, color: "#C77F2E", label: "Intelligence",
    desc: "Composite score measuring overall reasoning and language capability across diverse tasks. Source: Artificial Analysis (0–100 scale)." },
  { key: "coding_index" as const, color: "#2C4D9E", label: "Coding",
    desc: "Performance across code generation, debugging, and software engineering benchmarks. Source: Artificial Analysis (0–100 scale)." },
  { key: "math_index" as const, color: "#2D8F66", label: "Math",
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
  const ROW_H = 24, BAR_H = 12
  const plotW = W - PAD_L - PAD_R
  const H = top15.length * ROW_H + PAD_T + PAD_B
  const axisY = PAD_T + top15.length * ROW_H

  const toX = (v: number) => PAD_L + (v / maxScore) * plotW
  const xTicks = Array.from({ length: Math.ceil(maxScore / 10) + 1 }, (_, i) => i * 10).filter(t => t <= maxScore)

  const barFill = (m: ModelRecord) => m.open_weight === true ? metric.color : "#8E97AC"

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top 15 Models by Capability</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{metric.desc}</p>
        </div>
        <div className="flex gap-1 shrink-0 mt-0.5">
          {BAR_METRICS.map(m => (
            <button key={m.key} onClick={() => setActiveKey(m.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
                activeKey === m.key ? "text-white border-transparent" : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
              }`}
              style={activeKey === m.key ? { backgroundColor: m.color, borderColor: m.color } : {}}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5 mt-2 mb-1">
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="w-3 h-2.5 rounded-sm inline-block" style={{ backgroundColor: metric.color }} />
          Open-weight
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="w-3 h-2.5 rounded-sm inline-block bg-[var(--border-medium)]" />
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
                  stroke={t === 0 ? "#DDE3EC" : "#EDF0F6"} strokeWidth={1} />
                <text x={x} y={axisY + 14} textAnchor="middle"
                  fontSize={9} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">{t}</text>
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
                  <rect x={0} y={rowY} width={W} height={ROW_H} fill="#F5F7FB" rx={2} />
                )}
                {/* Rank number */}
                <text x={10} y={rowY + ROW_H / 2}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize={9} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">
                  {i + 1}
                </text>
                {/* Model name */}
                <text x={34} y={rowY + ROW_H / 2}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize={9} fill={isHov ? "#0F1E3D" : "#4A5878"}
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
                  fill={isHov ? "#0F1E3D" : "#8E97AC"}
                  fontFamily="ui-sans-serif, system-ui">
                  {val.toFixed(1)}
                </text>
              </g>
            )
          })}

          {/* Y axis line */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={axisY} stroke="#8E97AC" strokeWidth={1} />
          {/* X axis bottom line */}
          <line x1={PAD_L} y1={axisY} x2={PAD_L + plotW} y2={axisY} stroke="#8E97AC" strokeWidth={1} />
          {/* X axis label — below tick numbers with clear separation */}
          <text x={PAD_L + plotW / 2} y={H - 8} textAnchor="middle"
            fontSize={11} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">Score (0 to 100)</text>
        </svg>
      </div>
    </div>
  )
}


// ── Scatter Section (metrics header + both scatter plots) ────────────────────

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-tertiary)] leading-tight">{label}</div>
      <div className="text-base font-semibold text-[var(--text-primary)] mt-0.5 tabular-nums">{value}</div>
    </div>
  )
}

function ScatterSection({ models }: { models: ModelRecord[] }) {
  const top10Open = [...models]
    .filter(m => m.open_weight === true && m.intelligence_index != null)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 10)

  const top10Closed = [...models]
    .filter(m => m.open_weight !== true && m.intelligence_index != null)
    .sort((a, b) => b.intelligence_index! - a.intelligence_index!)
    .slice(0, 10)

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  const openIntel  = avg(top10Open.map(m => m.intelligence_index!))
  const openSpeed  = avg(top10Open.filter(m => m.tokens_per_sec != null && m.tokens_per_sec > 0).map(m => m.tokens_per_sec!))
  const openPrice  = avg(top10Open.filter(m => m.price_blended != null && m.price_blended > 0).map(m => m.price_blended!))
  const closedIntel = avg(top10Closed.map(m => m.intelligence_index!))
  const closedSpeed = avg(top10Closed.filter(m => m.tokens_per_sec != null && m.tokens_per_sec > 0).map(m => m.tokens_per_sec!))
  const closedPrice = avg(top10Closed.filter(m => m.price_blended != null && m.price_blended > 0).map(m => m.price_blended!))

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Metrics header */}
      <div className="px-5 py-4 grid grid-cols-2 gap-6 divide-x divide-slate-200 bg-[var(--bg-base)]">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-amber)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--text-primary)]">Open-weight — top 10</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <MetricStat label="Avg Intelligence" value={openIntel != null ? openIntel.toFixed(1) : "n/a"} />
            <MetricStat label="Avg Speed" value={openSpeed != null ? `${openSpeed.toFixed(0)} t/s` : "n/a"} />
            <MetricStat label="Avg Price / 1M" value={openPrice != null ? fmtPrice(openPrice) : "n/a"} />
          </div>
        </div>
        <div className="pl-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-tertiary)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--text-primary)]">Closed — top 10</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <MetricStat label="Avg Intelligence" value={closedIntel != null ? closedIntel.toFixed(1) : "n/a"} />
            <MetricStat label="Avg Speed" value={closedSpeed != null ? `${closedSpeed.toFixed(0)} t/s` : "n/a"} />
            <MetricStat label="Avg Price / 1M" value={closedPrice != null ? fmtPrice(closedPrice) : "n/a"} />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border-subtle)]" />
      <div className="grid grid-cols-2 divide-x divide-slate-100 items-start">
        <DownloadableNode corner="br" filename="cost-vs-intelligence.png"><CostScatter models={models} inner /></DownloadableNode>
        <DownloadableNode corner="br" filename="speed-vs-intelligence.png"><SpeedVsIntelligence models={models} inner /></DownloadableNode>
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
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 pt-4 pb-9">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Geographic Distribution</h3>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Models by country of origin, split by open-weight vs. proprietary.</p>

      <div className="flex items-center gap-4 mt-3 mb-4">
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--border-medium)] inline-block" /> Closed / proprietary
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-amber)] inline-block" /> Open-weight
        </span>
      </div>

      <div className="space-y-3">
        {sorted.map(d => {
          const closedW = (d.closed / maxTotal) * 100
          const openW   = (d.open   / maxTotal) * 100
          return (
            <div key={d.country} className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-secondary)] w-32 shrink-0 text-right font-medium">{d.country}</span>
              <div className="flex-1 flex rounded overflow-hidden h-6 bg-[var(--bg-base)]">
                {d.closed > 0 && (
                  <div className="bg-[var(--bg-subtle)] flex items-center justify-center text-[10px] font-medium text-[var(--text-secondary)] shrink-0"
                    style={{ width: `${closedW}%` }}>
                    {closedW > 7 ? d.closed : ""}
                  </div>
                )}
                {d.open > 0 && (
                  <div className="bg-[var(--accent-amber)]/50 flex items-center justify-center text-[10px] font-medium text-[var(--accent-amber)] shrink-0"
                    style={{ width: `${openW}%` }}>
                    {openW > 7 ? d.open : ""}
                  </div>
                )}
              </div>
              <span className="text-xs font-semibold text-[var(--text-primary)] w-8 tabular-nums text-right">{d.total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

type ModelTab = "general" | "speech" | "compare"
const MODEL_TABS: { key: ModelTab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "speech",  label: "Speech" },
  { key: "compare", label: "Compare" },
]

export default function FrontierModels({
  data,
  speech,
  builtAt,
}: {
  data: ModelsData
  speech: SpeechData | null
  builtAt: string | null
}) {
  const [tab, setTab] = useState<ModelTab>("general")

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              color: "var(--text-primary)",
              lineHeight: 1.15,
            }}
          >
            Model Benchmarks
          </h1>
          <MetadataStrip data={data} builtAt={builtAt} />
        </div>
        <RefreshButton builtAt={builtAt} />
      </div>

      {/* Tab bar */}
      <div className="flex items-end gap-0 mb-5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {MODEL_TABS.map((t) => {
          const on = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="px-4 py-2.5 -mb-px text-[13px] font-medium transition-colors"
              style={{
                borderBottom: `2px solid ${on ? "var(--accent-blue)" : "transparent"}`,
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === "general" && (
        <div className="flex gap-6 items-start">
          {/* LEFT: sticky leaderboard sidebar */}
          <div className="w-72 xl:w-80 shrink-0 sticky top-[88px]">
            <SideLeaderboard models={data.models} />
          </div>

          {/* RIGHT: all content stacked */}
          <div className="flex-1 min-w-0 space-y-3">
            <BestInClass models={data.models} />
            <DownloadableNode corner="br" filename="top-models.png"><TopModelsBarChart models={data.models} /></DownloadableNode>
            <div className="grid grid-cols-2 gap-3 items-start">
              <DownloadableNode corner="br" filename="release-timeline.png"><ReleaseTimeline models={data.models} /></DownloadableNode>
              <DownloadableNode corner="br" filename="geographic-distribution.png"><GeographyChart models={data.models} /></DownloadableNode>
            </div>
            <ScatterSection models={data.models} />
          </div>
        </div>
      )}

      {tab === "speech" && <SpeechTab speech={speech} />}

      {tab === "compare" && <CompareTab models={data.models} rankings={data.rankings} speech={speech} />}
    </div>
  )
}
