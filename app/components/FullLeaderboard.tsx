"use client"

import { useState } from "react"
import type { ModelRecord } from "../types"

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
function orgColor(org: string) { return ORG_COLORS[org] ?? "#8E97AC" }

function fmt(n: number | null, dec = 1) { return n == null ? "—" : n.toFixed(dec) }
function fmtPrice(n: number | null) {
  if (n == null) return "—"
  if (n < 0.01) return `$${n.toFixed(3)}`
  if (n < 1)    return `$${n.toFixed(2)}`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string | null) {
  if (!d) return "—"
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) }
  catch { return d }
}

type SortKey =
  | "intelligence_index" | "coding_index" | "math_index"
  | "gpqa" | "hle" | "mmlu_pro" | "livecodebench"
  | "price_blended" | "tokens_per_sec" | "release_date"

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: "intelligence_index", label: "Intelligence" },
  { key: "coding_index",       label: "Coding"       },
  { key: "math_index",         label: "Math"         },
  { key: "gpqa",               label: "GPQA"         },
  { key: "hle",                label: "HLE"          },
  { key: "mmlu_pro",           label: "MMLU-Pro"     },
  { key: "livecodebench",      label: "LiveCode"     },
  { key: "price_blended",      label: "Price/1M"     },
  { key: "tokens_per_sec",     label: "Tok/s"        },
  { key: "release_date",       label: "Released"     },
]

export default function FullLeaderboard({ models }: { models: ModelRecord[] }) {
  const [sortKey, setSortKey]     = useState<SortKey>("intelligence_index")
  const [sortAsc, setSortAsc]     = useState(false)
  const [filterOpen, setFilterOpen] = useState<"all" | "open" | "closed">("all")
  const [filterOrg, setFilterOrg] = useState("all")
  const [filterCountry, setFilterCountry] = useState("all")
  const [search, setSearch]       = useState("")

  const orgs      = Array.from(new Set(models.map(m => m.org))).sort()
  const countries = Array.from(new Set(models.map(m => m.country).filter(Boolean))).sort()

  const priceAsc = sortKey === "price_blended"
  const defaultAsc = priceAsc

  const filtered = models
    .filter(m => {
      if (filterOpen === "open"   && m.open_weight !== true)  return false
      if (filterOpen === "closed" && m.open_weight !== false) return false
      if (filterOrg !== "all" && m.org !== filterOrg)             return false
      if (filterCountry !== "all" && m.country !== filterCountry) return false
      if (search && !m.name.toLowerCase().includes(search.toLowerCase()) &&
          !m.org.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      const asc = sortAsc
      if (sortKey === "release_date") {
        const av = a.release_date ?? "", bv = b.release_date ?? ""
        return asc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1)
      }
      const av = (a[sortKey] as number | null) ?? (asc ? Infinity : -Infinity)
      const bv = (b[sortKey] as number | null) ?? (asc ? Infinity : -Infinity)
      return asc ? av - bv : bv - av
    })

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(v => !v)
    else { setSortKey(k); setSortAsc(k === "price_blended" ? true : false) }
  }

  function Th({ col }: { col: typeof COLUMNS[0] }) {
    const active = sortKey === col.key
    return (
      <th
        onClick={() => handleSort(col.key)}
        className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] whitespace-nowrap select-none border-b border-[var(--border-subtle)]"
      >
        <span className="flex items-center gap-1">
          {col.label}
          {active && <span className="text-[var(--accent-amber)] font-bold">{sortAsc ? "↑" : "↓"}</span>}
        </span>
      </th>
    )
  }

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Filters */}
      <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search model or org…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-[var(--text-primary)] bg-[var(--bg-surface)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 w-56"
        />

        <div className="flex rounded-lg border border-[var(--border-subtle)] overflow-hidden text-xs">
          {(["all", "open", "closed"] as const).map(v => (
            <button key={v} onClick={() => setFilterOpen(v)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                filterOpen === v ? "bg-[var(--accent-amber)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"
              }`}>
              {v}
            </button>
          ))}
        </div>

        <select
          value={filterOrg}
          onChange={e => setFilterOrg(e.target.value)}
          className="text-xs border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-surface)] focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          <option value="all">All orgs</option>
          {orgs.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        <select
          value={filterCountry}
          onChange={e => setFilterCountry(e.target.value)}
          className="text-xs border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[var(--text-secondary)] bg-[var(--bg-surface)] focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          <option value="all">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <span className="ml-auto text-xs text-[var(--text-tertiary)] tabular-nums">{filtered.length} models</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] w-8 border-b border-[var(--border-subtle)]">#</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">Model</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">Org</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)] whitespace-nowrap">Country</th>
              {COLUMNS.map(col => <Th key={col.key} col={col} />)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((m, i) => (
              <tr key={m.id} className="hover:bg-[var(--bg-base)]/70 transition-colors">
                <td className="px-3 py-2 text-xs text-[var(--text-tertiary)] tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)] max-w-[220px] truncate" title={m.name}>{m.name}</span>
                    {m.open_weight === true && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] font-medium">open</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: orgColor(m.org) }} />
                    {m.org}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)] whitespace-nowrap">{m.country || "—"}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-primary)] font-medium">{fmt(m.intelligence_index)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmt(m.coding_index)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmt(m.math_index)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmt(m.gpqa)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmt(m.hle)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmt(m.mmlu_pro)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmt(m.livecodebench)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmtPrice(m.price_blended)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text-secondary)]">{fmt(m.tokens_per_sec, 0)}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{fmtDate(m.release_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="px-6 py-12 text-center text-sm text-[var(--text-tertiary)]">No models match your filters.</div>
      )}
    </div>
  )
}
