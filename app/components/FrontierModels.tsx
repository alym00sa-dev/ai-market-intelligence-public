"use client"

import { useState, useCallback } from "react"
import type { ModelsData, ModelRecord, RankedModel } from "../types"

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function orgColor(org: string): string {
  return ORG_COLORS[org] ?? DEFAULT_COLOR
}

function fmt(n: number | null, decimals = 1): string {
  if (n == null) return "—"
  return n.toFixed(decimals)
}

function fmtPct(n: number | null): string {
  if (n == null) return "—"
  return `${Math.round(n * 100)}%`
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—"
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) }
  catch { return d }
}

// ── Refresh button ────────────────────────────────────────────────────────────

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

    // Poll until done
    const poll = setInterval(async () => {
      const r = await fetch("/api/refresh-models")
      const s: RefreshStatus = await r.json()
      setStatus(s)
      if (s.state === "done" || s.state === "error") {
        clearInterval(poll)
        if (s.state === "done") {
          setTimeout(() => window.location.reload(), 1000)
        }
      }
    }, 3000)
  }, [])

  const running = status?.state === "running"

  return (
    <div className="flex items-center gap-3">
      {builtAt && (
        <span className="text-xs text-slate-400">Data as of {builtAt}</span>
      )}
      <button
        onClick={startRefresh}
        disabled={running}
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
            {status.log.map((line, i) => (
              <p key={i} className="text-xs font-mono text-slate-400">{line}</p>
            ))}
          </div>
          {status.state === "error" && (
            <p className="mt-2 text-xs text-red-400 font-mono">{status.error}</p>
          )}
          {status.state === "done" && (
            <p className="mt-2 text-xs text-green-400 font-mono">✓ Complete — reloading page…</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ data }: { data: ModelsData }) {
  const latest = data.models.reduce((best, m) => {
    if (!m.release_date) return best
    return !best || m.release_date > best ? m.release_date : best
  }, null as string | null)

  const stats = [
    { label: "Models Tracked",    value: data.model_count.toLocaleString() },
    { label: "Open-Weight",       value: data.open_count.toLocaleString() },
    { label: "Labs & Orgs",       value: data.org_count.toLocaleString() },
    { label: "Latest Release",    value: fmtDate(latest) },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="bg-white rounded-xl border border-slate-200/70 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-4 py-3">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{s.label}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Release Timeline ──────────────────────────────────────────────────────────

function ReleaseTimeline({ models }: { models: ModelRecord[] }) {
  // Bucket by quarter
  const buckets: Record<string, { open: number; closed: number }> = {}
  for (const m of models) {
    if (!m.release_date) continue
    const d = new Date(m.release_date)
    if (isNaN(d.getTime())) continue
    const year = d.getFullYear()
    if (year < 2023) continue
    const q = Math.floor(d.getMonth() / 3) + 1
    const key = `${year} Q${q}`
    if (!buckets[key]) buckets[key] = { open: 0, closed: 0 }
    if (m.open_weight === true) buckets[key].open++
    else buckets[key].closed++
  }

  const quarters = Object.keys(buckets).sort()
  const maxTotal = Math.max(...quarters.map((q) => buckets[q].open + buckets[q].closed), 1)

  const W = 560, H = 180, PAD_L = 32, PAD_B = 28, PAD_T = 12, PAD_R = 12
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const barW = Math.max(2, plotW / quarters.length - 3)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Release Cadence</h3>

      <div className="flex items-center gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block" /> Open-weight
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Closed / unknown
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
          {/* Y gridlines */}
          {[0.25, 0.5, 0.75, 1.0].map((v) => {
            const y = PAD_T + plotH * (1 - v)
            return (
              <g key={v}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 4} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                  {Math.round(v * maxTotal)}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {quarters.map((q, i) => {
            const { open, closed } = buckets[q]
            const total = open + closed
            const x = PAD_L + (i / quarters.length) * plotW + (plotW / quarters.length - barW) / 2
            const totalH = (total / maxTotal) * plotH
            const openH = (open / maxTotal) * plotH
            const closedH = totalH - openH

            return (
              <g key={q}>
                {/* closed portion (bottom) */}
                <rect x={x} y={PAD_T + plotH - totalH + openH} width={barW} height={closedH}
                  fill="#cbd5e1" rx={1} />
                {/* open portion (top) */}
                <rect x={x} y={PAD_T + plotH - totalH} width={barW} height={openH}
                  fill="#a78bfa" rx={1} />
                {/* X label — every other quarter */}
                {i % 2 === 0 && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle"
                    fontSize={7} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                    {q}
                  </text>
                )}
              </g>
            )
          })}

          {/* Axes */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ── Cost vs Capability Scatter ────────────────────────────────────────────────

function CostScatter({ models }: { models: ModelRecord[] }) {
  const [hovered, setHovered] = useState<ModelRecord | null>(null)

  // Filter to models with both intelligence index and price
  const plotModels = models.filter((m) => m.intelligence_index != null && m.price_blended != null && m.price_blended > 0)

  const W = 520, H = 260, PAD_L = 48, PAD_B = 32, PAD_T = 12, PAD_R = 24
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const prices = plotModels.map((m) => m.price_blended!)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const logMin = Math.log10(Math.max(minP, 0.01))
  const logMax = Math.log10(maxP)

  const intelligences = plotModels.map((m) => m.intelligence_index!)
  const minI = Math.min(...intelligences), maxI = Math.max(...intelligences)

  const xPos = (intel: number) => PAD_L + ((intel - minI) / (maxI - minI || 1)) * plotW
  const yPos = (price: number) => PAD_T + (1 - (Math.log10(Math.max(price, 0.01)) - logMin) / (logMax - logMin || 1)) * plotH

  const yTicks = [0.01, 0.1, 1, 5, 15, 50, 150].filter((t) => t >= minP * 0.5 && t <= maxP * 2)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Cost vs. Capability</h3>
      <p className="text-xs text-slate-400 mb-4">Blended price per 1M tokens (log scale) vs. Intelligence Index</p>

      <div className="overflow-x-auto">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
          {/* Y gridlines + labels */}
          {yTicks.map((t) => {
            const y = yPos(t)
            if (y < PAD_T || y > PAD_T + plotH) return null
            return (
              <g key={t}>
                <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 4} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">
                  ${t < 1 ? t.toFixed(2) : t}
                </text>
              </g>
            )
          })}

          {/* Dots */}
          {plotModels.map((m) => {
            const x = xPos(m.intelligence_index!)
            const y = yPos(m.price_blended!)
            const r = hovered?.id === m.id ? 5 : 3.5
            return (
              <circle
                key={m.id} cx={x} cy={y} r={r}
                fill={orgColor(m.org)} fillOpacity={0.8}
                stroke={hovered?.id === m.id ? "#0f172a" : "white"} strokeWidth={0.5}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHovered(m)}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })}

          {/* Tooltip */}
          {hovered && (() => {
            const x = xPos(hovered.intelligence_index!)
            const y = yPos(hovered.price_blended!)
            const tx = x > W * 0.7 ? x - 140 : x + 8
            const ty = y < 40 ? y + 8 : y - 52
            return (
              <g>
                <rect x={tx} y={ty} width={132} height={44} rx={4}
                  fill="#0f172a" fillOpacity={0.92} />
                <text x={tx + 6} y={ty + 13} fontSize={8} fontWeight={600} fill="white"
                  fontFamily="ui-sans-serif, system-ui">{hovered.name.length > 22 ? hovered.name.slice(0, 20) + "…" : hovered.name}</text>
                <text x={tx + 6} y={ty + 24} fontSize={7.5} fill="#94a3b8"
                  fontFamily="ui-sans-serif, system-ui">{hovered.org}</text>
                <text x={tx + 6} y={ty + 36} fontSize={7.5} fill="#cbd5e1"
                  fontFamily="ui-sans-serif, system-ui">
                  Intel: {fmt(hovered.intelligence_index)}  ·  {fmtPrice(hovered.price_blended)}/1M
                </text>
              </g>
            )
          })()}

          {/* Axes */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#e2e8f0" strokeWidth={1} />
          <text x={PAD_L + plotW / 2} y={H - 4} textAnchor="middle"
            fontSize={8} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui">Intelligence Index →</text>
        </svg>
      </div>

      {/* Org legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(ORG_COLORS).map(([org, color]) => (
          <span key={org} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
            {org}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full inline-block shrink-0 bg-slate-400" />
          Other
        </span>
      </div>
    </div>
  )
}

// ── Domain Rankings ───────────────────────────────────────────────────────────

const RANKING_TABS = [
  "reasoning", "coding", "math", "general", "safety",
  "healthcare", "legal", "finance", "vision", "agents", "language",
]

function DomainRankings({ rankings }: { rankings: ModelsData["rankings"] }) {
  const available = RANKING_TABS.filter((t) => rankings[t]?.models?.length)
  const [active, setActive] = useState(available[0] ?? "")

  const ranked: RankedModel[] = rankings[active]?.models ?? []

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">Domain Rankings</h3>
        <span className="text-xs text-slate-400">TrueSkill — top 10 per domain</span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {available.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
              active === tab
                ? "bg-violet-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            }`}
          >
            {tab.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="space-y-2">
        {ranked.map((m) => {
          const barW = Math.round(m.score * 100)
          return (
            <div key={m.model_id} className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-slate-400 w-4 text-right shrink-0">
                {m.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-slate-800 truncate">{m.model_name}</span>
                  {m.open_weight && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">open</span>
                  )}
                  {m.min_input_price != null && m.min_input_price > 0 && (
                    <span className="shrink-0 text-[10px] text-slate-400 ml-auto tabular-nums">
                      ${(m.min_input_price / 1_000_000).toFixed(2)}/1M
                    </span>
                  )}
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-400 rounded-full" style={{ width: `${barW}%` }} />
                </div>
              </div>
              <span className="text-xs tabular-nums text-slate-400 w-8 text-right shrink-0">
                {m.score.toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Frontier Leaderboard ──────────────────────────────────────────────────────

type SortKey = "intelligence_index" | "coding_index" | "math_index" | "price_blended" | "tokens_per_sec" | "release_date"

function FrontierLeaderboard({ models }: { models: ModelRecord[] }) {
  const [filterOpen, setFilterOpen] = useState<"all" | "open" | "closed">("all")
  const [filterOrg, setFilterOrg] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("intelligence_index")
  const [sortAsc, setSortAsc] = useState(false)
  const [showCount, setShowCount] = useState(50)

  const orgs = Array.from(new Set(models.map((m) => m.org))).sort()

  const filtered = models
    .filter((m) => {
      if (filterOpen === "open" && m.open_weight !== true) return false
      if (filterOpen === "closed" && m.open_weight !== false) return false
      if (filterOrg !== "all" && m.org !== filterOrg) return false
      return true
    })
    .sort((a, b) => {
      const av = sortKey === "release_date" ? (a.release_date ?? "") : ((a[sortKey] as number | null) ?? -Infinity)
      const bv = sortKey === "release_date" ? (b.release_date ?? "") : ((b[sortKey] as number | null) ?? -Infinity)
      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
    .slice(0, showCount)

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <th
        className="px-3 py-2 text-left text-xs font-medium text-slate-500 cursor-pointer hover:text-slate-700 whitespace-nowrap select-none"
        onClick={() => { if (active) setSortAsc((v) => !v); else { setSortKey(k); setSortAsc(false) } }}
      >
        <span className="flex items-center gap-1">
          {label}
          {active && <span className="text-violet-500">{sortAsc ? "↑" : "↓"}</span>}
        </span>
      </th>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-700 mr-auto">Frontier Leaderboard</h3>

        {/* Open/closed toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {(["all", "open", "closed"] as const).map((v) => (
            <button key={v} onClick={() => setFilterOpen(v)}
              className={`px-2.5 py-1.5 capitalize transition-colors ${filterOpen === v ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              {v}
            </button>
          ))}
        </div>

        {/* Org filter */}
        <select
          value={filterOrg}
          onChange={(e) => setFilterOrg(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          <option value="all">All orgs</option>
          {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 w-8">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Model</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Org</th>
              <Th label="Intelligence" k="intelligence_index" />
              <Th label="Coding" k="coding_index" />
              <Th label="Math" k="math_index" />
              <Th label="Price/1M" k="price_blended" />
              <Th label="Tok/s" k="tokens_per_sec" />
              <Th label="Released" k="release_date" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((m, i) => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-800 max-w-[200px] truncate" title={m.name}>{m.name}</span>
                    {m.open_weight === true && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">open</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: orgColor(m.org) }} />
                    {m.org}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-700">{fmt(m.intelligence_index)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{fmt(m.coding_index)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{fmt(m.math_index)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-600">{fmtPrice(m.price_blended)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{fmt(m.tokens_per_sec, 0)}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{fmtDate(m.release_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {models.filter((m) => {
        if (filterOpen === "open" && m.open_weight !== true) return false
        if (filterOpen === "closed" && m.open_weight !== false) return false
        if (filterOrg !== "all" && m.org !== filterOrg) return false
        return true
      }).length > showCount && (
        <button onClick={() => setShowCount((n) => n + 50)}
          className="mt-3 w-full text-xs text-slate-400 hover:text-slate-600 py-2 border border-dashed border-slate-200 rounded-lg transition-colors">
          Show more
        </button>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function FrontierModels({ data, builtAt }: { data: ModelsData; builtAt: string | null }) {
  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page header + refresh */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Frontier Model Tracking</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {data.model_count} models across {data.org_count} labs — benchmarks, cost, and capability signals
          </p>
        </div>
        <RefreshButton builtAt={builtAt} />
      </div>

      {/* Stats */}
      <StatsBar data={data} />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReleaseTimeline models={data.models} />
        <CostScatter models={data.models} />
      </div>

      {/* Domain rankings */}
      <DomainRankings rankings={data.rankings} />

      {/* Full leaderboard */}
      <FrontierLeaderboard models={data.models} />
    </div>
  )
}
