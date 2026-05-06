"use client"

import { useState } from "react"
import type { CompanyProfile, Job } from "../types"

const DISPLAY_NAMES: Record<string, string> = {
  "Amazon AGI":         "Amazon",
  "Microsoft Research": "Microsoft",
  "Google DeepMind":    "Google",
}

const COMPANY_COLORS: Record<string, string> = {
  "Anthropic":  "#6366f1",
  "OpenAI":     "#10b981",
  "Google":     "#3b82f6",
  "xAI":        "#f59e0b",
  "Mistral AI": "#ec4899",
  "Cohere":     "#8b5cf6",
  "NVIDIA":     "#22c55e",
  "Amazon":     "#f97316",
  "Microsoft":  "#0ea5e9",
  "Inflection AI": "#06b6d4",
  "Stability AI":  "#a855f7",
  "Moonshot AI":   "#ef4444",
  "ByteDance":     "#f43f5e",
}

const CATEGORY_COLORS: Record<string, string> = {
  engineering:  "#3b82f6",
  research:     "#8b5cf6",
  sales_gtm:    "#10b981",
  operations:   "#f59e0b",
  other:        "#94a3b8",
  unclassified: "#cbd5e1",
}

const CATEGORY_LABELS: Record<string, string> = {
  engineering:  "Engineering",
  research:     "Research",
  sales_gtm:    "Sales / GTM",
  operations:   "Operations",
  other:        "Other",
  unclassified: "Unclassified",
}

const VERTICAL_LABELS: Record<string, string> = {
  health_rd:       "Health R&D",
  health_delivery: "Health Delivery",
  agriculture:     "Agriculture",
  education:       "Education",
}

const CATEGORY_ORDER = ["engineering", "research", "sales_gtm", "operations", "other", "unclassified"]
const MAX_SELECTED = 5

function displayName(raw: string): string {
  return DISPLAY_NAMES[raw] ?? raw
}

function companyColor(raw: string): string {
  return COMPANY_COLORS[displayName(raw)] ?? "#94a3b8"
}

function formatSubArea(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Stacked bar (SVG, no external libs) ─────────────────────────────────────

function StackedBar({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  const segments = CATEGORY_ORDER.filter((c) => (breakdown[c] ?? 0) > 0)
  return (
    <div className="w-full">
      <div className="flex rounded-full overflow-hidden h-2 mb-2">
        {segments.map((cat) => (
          <div
            key={cat}
            style={{
              width: `${((breakdown[cat] ?? 0) / total) * 100}%`,
              backgroundColor: CATEGORY_COLORS[cat] ?? "#cbd5e1",
            }}
            title={`${CATEGORY_LABELS[cat]}: ${breakdown[cat]}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((cat) => {
          const pct = Math.round(((breakdown[cat] ?? 0) / total) * 100)
          return (
            <span key={cat} className="inline-flex items-center gap-1 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              <span className="text-slate-400">{CATEGORY_LABELS[cat]}</span>
              <span className="text-slate-600 font-medium tabular-nums">{pct}%</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Company card ─────────────────────────────────────────────────────────────

function CompanyCard({ profile }: { profile: CompanyProfile }) {
  const name  = displayName(profile.company)
  const color = companyColor(profile.company)

  const topAreas = profile.buildingInsights
    .slice(0, 3)
    .map((i) => ({ label: formatSubArea(i.subArea), count: i.count }))

  const verticals = Object.entries(profile.verticalBreakdown ?? {})
    .filter(([, v]) => v > 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-5 flex flex-col gap-4 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-semibold text-slate-900 text-[15px] truncate">{name}</span>
        <span className="ml-auto text-2xl font-bold tabular-nums text-slate-900">
          {profile.total.toLocaleString()}
        </span>
      </div>
      <p className="text-[11px] text-slate-400 -mt-3">open roles</p>

      {/* Category breakdown */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
          Role mix
        </p>
        <StackedBar breakdown={profile.categoryBreakdown} total={profile.total} />
      </div>

      {/* Top hiring areas */}
      {topAreas.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Top areas
          </p>
          <div className="space-y-1.5">
            {topAreas.map(({ label, count }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-slate-600 truncate">{label}</span>
                <span className="text-[11px] font-medium tabular-nums text-slate-500 shrink-0">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verticals */}
      {verticals.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Verticals
          </p>
          <div className="flex flex-wrap gap-1.5">
            {verticals.map(([v, count]) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-medium border border-violet-100"
              >
                {VERTICAL_LABELS[v] ?? v}
                <span className="text-violet-400 tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CompanyComparison({
  profiles,
}: {
  profiles: CompanyProfile[]
  jobs: Job[]
}) {
  const sorted   = [...profiles].sort((a, b) => b.total - a.total)
  const defaults = sorted.slice(0, 4).map((p) => p.company)
  const [selected, setSelected] = useState<string[]>(defaults)

  function toggle(company: string) {
    setSelected((prev) => {
      if (prev.includes(company)) return prev.filter((c) => c !== company)
      if (prev.length >= MAX_SELECTED) return prev
      return [...prev, company]
    })
  }

  const selectedProfiles = selected
    .map((c) => profiles.find((p) => p.company === c))
    .filter(Boolean) as CompanyProfile[]

  return (
    <div className="space-y-4">
      {/* Company selector */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Select companies to compare
          </p>
          <span className="text-[11px] text-slate-400">
            {selected.length} / {MAX_SELECTED} selected
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sorted.map((p) => {
            const name     = displayName(p.company)
            const color    = companyColor(p.company)
            const isOn     = selected.includes(p.company)
            const disabled = !isOn && selected.length >= MAX_SELECTED
            return (
              <button
                key={p.company}
                onClick={() => toggle(p.company)}
                disabled={disabled}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                  isOn
                    ? "border-transparent text-white shadow-sm"
                    : disabled
                    ? "border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed"
                    : "border-slate-200 text-slate-600 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
                style={isOn ? { backgroundColor: color } : {}}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: isOn ? "rgba(255,255,255,0.7)" : color }}
                />
                {name}
                <span className={`tabular-nums text-[10px] ${isOn ? "text-white/70" : "text-slate-400"}`}>
                  {p.total}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Comparison grid */}
      {selectedProfiles.length > 0 ? (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(selectedProfiles.length, 3)}, minmax(0, 1fr))` }}
        >
          {selectedProfiles.map((p) => (
            <CompanyCard key={p.company} profile={p} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
          <p className="text-slate-400 text-sm">Select at least one company above to compare.</p>
        </div>
      )}
    </div>
  )
}
