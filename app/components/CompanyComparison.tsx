"use client"

import { useState } from "react"
import type { CompanyProfile, Job } from "../types"

const DISPLAY_NAMES: Record<string, string> = {
  "Amazon AGI":         "Amazon",
  "Microsoft Research": "Microsoft",
  "Google DeepMind":    "Google",
}

const COMPANY_COLORS: Record<string, string> = {
  "Anthropic":     "#6366f1",
  "OpenAI":        "#10b981",
  "Google":        "#3b82f6",
  "xAI":           "#f59e0b",
  "Mistral AI":    "#ec4899",
  "Cohere":        "#8b5cf6",
  "NVIDIA":        "#22c55e",
  "Amazon":        "#f97316",
  "Microsoft":     "#0ea5e9",
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
const MAX_SELECTED = 3

function displayName(raw: string): string {
  return DISPLAY_NAMES[raw] ?? raw
}

function companyColor(raw: string): string {
  return COMPANY_COLORS[displayName(raw)] ?? "#94a3b8"
}

function formatSubArea(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Stacked bar ───────────────────────────────────────────────────────────────

function StackedBar({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  const segments = CATEGORY_ORDER.filter((c) => (breakdown[c] ?? 0) > 0)
  return (
    <div className="w-full">
      <div className="flex rounded-full overflow-hidden h-1.5 mb-2">
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
              <span className="text-slate-500">{CATEGORY_LABELS[cat]}</span>
              <span className="text-slate-700 font-medium tabular-nums">{pct}%</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Table primitives ──────────────────────────────────────────────────────────

function RowLabel({ label }: { label: string }) {
  return (
    <td className="px-5 py-4 align-top w-[150px]">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap">
        {label}
      </span>
    </td>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-5 py-4 align-top border-l border-slate-100">
      {children}
    </td>
  )
}

const Empty = () => <span className="text-[12px] text-slate-300">—</span>

// ── Main component ────────────────────────────────────────────────────────────

export default function CompanyComparison({
  profiles,
}: {
  profiles: CompanyProfile[]
  jobs: Job[]
}) {
  const sorted   = [...profiles].sort((a, b) => b.total - a.total)
  const defaults = sorted.slice(0, 3).map((p) => p.company)
  const [selected, setSelected] = useState<string[]>(defaults)

  function toggle(company: string) {
    setSelected((prev) => {
      if (prev.includes(company)) return prev.length > 1 ? prev.filter((c) => c !== company) : prev
      if (prev.length >= MAX_SELECTED) return prev
      return [...prev, company]
    })
  }

  const sel = selected
    .map((c) => profiles.find((p) => p.company === c))
    .filter(Boolean) as CompanyProfile[]

  const hasBuilding      = sel.some((p) => p.buildingInsights.length > 0)
  const hasBuildLLM      = sel.some((p) => (p.llmSummary?.building?.length ?? 0) > 0)
  const hasSelling       = sel.some((p) => p.sellingInsights.length > 0)
  const hasSellLLM       = sel.some((p) => (p.llmSummary?.selling?.length ?? 0) > 0)
  const hasVerticals     = sel.some((p) => Object.values(p.verticalBreakdown).some((v) => v > 0))
  const hasVerticalLLM   = sel.some((p) => Object.keys(p.llmSummary?.vertical_bullets ?? {}).length > 0)
  const hasSocial        = sel.some((p) => p.socialImpactData.count > 0)
  const hasSocialLLM     = sel.some((p) => (p.llmSummary?.social_impact_bullets?.length ?? 0) > 0)

  return (
    <div className="space-y-4">

      {/* Company selector */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Select up to 3 companies to compare
          </p>
          <span className="text-[11px] text-slate-400 tabular-nums">{selected.length} / {MAX_SELECTED}</span>
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
                  {p.total.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Comparison table */}
      {sel.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <table className="w-full border-collapse">

            {/* Header */}
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="px-5 py-4 w-[150px]" />
                {sel.map((p) => {
                  const name  = displayName(p.company)
                  const color = companyColor(p.company)
                  return (
                    <th key={p.company} className="px-5 py-4 text-left border-l border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[14px] font-semibold text-slate-900">{name}</span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>

              {/* Open Roles */}
              <tr className="border-b border-slate-100">
                <RowLabel label="Open Roles" />
                {sel.map((p) => (
                  <Cell key={p.company}>
                    <span className="text-2xl font-bold tabular-nums text-slate-900">
                      {p.total.toLocaleString()}
                    </span>
                  </Cell>
                ))}
              </tr>

              {/* Role Mix */}
              <tr className="border-b border-slate-100 even:bg-slate-50/40 bg-slate-50/40">
                <RowLabel label="Role Mix" />
                {sel.map((p) => (
                  <Cell key={p.company}>
                    <StackedBar breakdown={p.categoryBreakdown} total={p.total} />
                  </Cell>
                ))}
              </tr>

              {/* Building Focus */}
              {hasBuilding && (
                <tr className="border-b border-slate-100">
                  <RowLabel label="Building Focus" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.buildingInsights.length > 0 ? (
                        <div className="space-y-1.5">
                          {p.buildingInsights.slice(0, 5).map((ins) => (
                            <div key={ins.subArea} className="flex items-baseline justify-between gap-3">
                              <span className="text-[12px] text-slate-600 truncate">{formatSubArea(ins.subArea)}</span>
                              <span className="text-[11px] font-medium tabular-nums text-slate-400 shrink-0">{ins.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* What They Build */}
              {hasBuildLLM && (
                <tr className="border-b border-slate-100 bg-slate-50/40">
                  <RowLabel label="What They Build" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.llmSummary?.building?.length ? (
                        <ul className="space-y-1.5">
                          {p.llmSummary.building.map((b, i) => (
                            <li key={i} className="flex gap-1.5 text-[12px] text-slate-600">
                              <span className="text-slate-300 shrink-0 mt-0.5 select-none">·</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* GTM Focus */}
              {hasSelling && (
                <tr className="border-b border-slate-100">
                  <RowLabel label="GTM Focus" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.sellingInsights.length > 0 ? (
                        <div className="space-y-1.5">
                          {p.sellingInsights.slice(0, 5).map((ins) => (
                            <div key={ins.subArea} className="flex items-baseline justify-between gap-3">
                              <span className="text-[12px] text-slate-600 truncate">{formatSubArea(ins.subArea)}</span>
                              <span className="text-[11px] font-medium tabular-nums text-slate-400 shrink-0">{ins.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* What They Sell */}
              {hasSellLLM && (
                <tr className="border-b border-slate-100 bg-slate-50/40">
                  <RowLabel label="What They Sell" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.llmSummary?.selling?.length ? (
                        <ul className="space-y-1.5">
                          {p.llmSummary.selling.map((b, i) => (
                            <li key={i} className="flex gap-1.5 text-[12px] text-slate-600">
                              <span className="text-slate-300 shrink-0 mt-0.5 select-none">·</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* Verticals */}
              {hasVerticals && (
                <tr className="border-b border-slate-100">
                  <RowLabel label="Verticals" />
                  {sel.map((p) => {
                    const active = Object.entries(p.verticalBreakdown).filter(([, v]) => v > 0)
                    return (
                      <Cell key={p.company}>
                        {active.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {active.map(([v, count]) => (
                              <span
                                key={v}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-medium border border-violet-100"
                              >
                                {VERTICAL_LABELS[v] ?? v}
                                <span className="text-violet-400 tabular-nums">{count}</span>
                              </span>
                            ))}
                          </div>
                        ) : <Empty />}
                      </Cell>
                    )
                  })}
                </tr>
              )}

              {/* Vertical Notes */}
              {hasVerticalLLM && (
                <tr className="border-b border-slate-100 bg-slate-50/40">
                  <RowLabel label="Vertical Notes" />
                  {sel.map((p) => {
                    const vb = p.llmSummary?.vertical_bullets ?? {}
                    const entries = Object.entries(vb).filter(([, bullets]) => bullets.length > 0)
                    return (
                      <Cell key={p.company}>
                        {entries.length > 0 ? (
                          <div className="space-y-3">
                            {entries.map(([vKey, bullets]) => (
                              <div key={vKey}>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                                  {VERTICAL_LABELS[vKey] ?? vKey}
                                </p>
                                <ul className="space-y-1">
                                  {bullets.map((b, i) => (
                                    <li key={i} className="flex gap-1.5 text-[12px] text-slate-600">
                                      <span className="text-slate-300 shrink-0 mt-0.5 select-none">·</span>
                                      <span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ) : <Empty />}
                      </Cell>
                    )
                  })}
                </tr>
              )}

              {/* Social Impact */}
              {hasSocial && (
                <tr className={hasSocialLLM ? "border-b border-slate-100" : ""}>
                  <RowLabel label="Social Impact" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.socialImpactData.count > 0 ? (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[15px] font-bold tabular-nums text-slate-900">
                            {p.socialImpactData.count}
                          </span>
                          <span className="text-[12px] text-slate-400">roles</span>
                          <span className="text-[11px] text-slate-400">
                            ({p.socialImpactData.pct.toFixed(1)}%)
                          </span>
                        </div>
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* Social Impact Notes */}
              {hasSocialLLM && (
                <tr className="bg-slate-50/40">
                  <RowLabel label="Social Notes" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.llmSummary?.social_impact_bullets?.length ? (
                        <ul className="space-y-1.5">
                          {p.llmSummary.social_impact_bullets.map((b, i) => (
                            <li key={i} className="flex gap-1.5 text-[12px] text-slate-600">
                              <span className="text-slate-300 shrink-0 mt-0.5 select-none">·</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
