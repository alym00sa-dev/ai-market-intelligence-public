"use client"

import { useState } from "react"
import type { CompanyProfile, CompanyChange, Job } from "../types"
import { SectionLabel, Donut, type DonutSegment } from "./ds"

const DISPLAY_NAMES: Record<string, string> = {
  "Amazon AGI":         "Amazon",
  "Microsoft Research": "Microsoft",
  "Google DeepMind":    "Google",
}

const COMPANY_COLORS: Record<string, string> = {
  "Anthropic":     "#D97757",
  "OpenAI":        "#10A37F",
  "Google":        "#4285F4",
  "xAI":           "#1F1F1F",
  "Meta":          "#1877F2",
  "Microsoft":     "#00A4EF",
  "Amazon":        "#FF9900",
  "NVIDIA":        "#76B900",
  "Mistral AI":    "#FF6B35",
  "Cohere":        "#39594D",
  "Inflection AI": "#06B6D4",
  "Stability AI":  "#A855F7",
  "Moonshot AI":   "#EF4444",
  "ByteDance":     "#F43F5E",
}

const CATEGORY_COLORS: Record<string, string> = {
  engineering:  "#2C4D9E",   // accent-blue
  research:     "#C77F2E",   // accent-amber
  sales_gtm:    "#2D8F66",   // accent-green
  operations:   "#6B5BC9",   // muted indigo
  other:        "#BCC4D2",   // light slate
  unclassified: "#DDE3EC",   // border-subtle
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
  return COMPANY_COLORS[displayName(raw)] ?? "var(--accent-blue)"
}

function formatSubArea(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function tint(hex: string, alpha: number): string {
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return hex
}

// ── Role-mix donut ──────────────────────────────────────────────────────────

function RoleMix({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  const present = CATEGORY_ORDER.filter((c) => (breakdown[c] ?? 0) > 0)
  const segments: DonutSegment[] = present.map((cat) => ({
    label: CATEGORY_LABELS[cat] ?? cat,
    value: breakdown[cat] ?? 0,
    color: CATEGORY_COLORS[cat] ?? "#DDE3EC",
  }))
  return (
    <div className="flex items-center gap-4">
      <Donut segments={segments} size={84} thickness={12} />
      <div className="flex flex-col gap-1">
        {present.map((cat) => {
          const pct = Math.round(((breakdown[cat] ?? 0) / total) * 100)
          return (
            <span key={cat} className="inline-flex items-center gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              <span style={{ color: "var(--text-secondary)" }}>{CATEGORY_LABELS[cat]}</span>
              <span className="font-mono tabular-nums" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {pct}%
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Weekly change (Δ + shift narrative) ───────────────────────────────────────

function ChangeDelta({ change }: { change?: CompanyChange }) {
  if (!change || (change.new === 0 && change.removed === 0)) return null
  return (
    <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono tabular-nums">
      <span style={{ color: "var(--accent-green)" }}>▲ {change.new} new</span>
      <span style={{ color: "var(--text-tertiary)" }}>·</span>
      <span style={{ color: "var(--accent-red)" }}>▼ {change.removed} closed</span>
      <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-plex-sans)" }}>this week</span>
    </div>
  )
}

// ── Bulleted list with colored dot ────────────────────────────────────────────

function BulletList({ items, dotColor }: { items: string[]; dotColor: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((b, i) => (
        <li key={i} className="flex gap-2 items-start text-[12px]">
          <span
            className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: dotColor }}
          />
          <span
            className="leading-relaxed"
            style={{ color: "var(--text-primary)" }}
          >
            {b}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ── Table primitives ──────────────────────────────────────────────────────────

function RowLabel({ label }: { label: string }) {
  return (
    <td className="px-5 py-4 align-top w-[150px]">
      <span
        className="text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </span>
    </td>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="px-5 py-4 align-top"
      style={{ borderLeft: "1px solid var(--border-subtle)" }}
    >
      {children}
    </td>
  )
}

const Empty = () => (
  <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>
)

const ROW_BORDER = { borderBottom: "1px solid var(--border-subtle)" }
const ROW_STRIPED_BG = "var(--bg-elevated)"

// ── Main component ────────────────────────────────────────────────────────────

export default function CompanyComparison({
  profiles,
  changes = {},
}: {
  profiles: CompanyProfile[]
  jobs: Job[]
  changes?: Record<string, CompanyChange>
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

  const hasShift         = sel.some((p) => (p.llmSummary?.shift?.length ?? 0) > 0)
  const hasChange        = sel.some((p) => {
    const c = changes[p.company]
    return c && (c.new > 0 || c.removed > 0)
  })
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
      <div
        className="rounded-xl px-5 py-4"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <SectionLabel as="span">Select up to 3 companies to compare</SectionLabel>
          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text-tertiary)" }}
          >
            {selected.length} / {MAX_SELECTED}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sorted.map((p) => {
            const name     = displayName(p.company)
            const color    = companyColor(p.company)
            const isOn     = selected.includes(p.company)
            const disabled = !isOn && selected.length >= MAX_SELECTED
            const buttonStyle: React.CSSProperties = isOn
              ? { backgroundColor: color, color: "#FFFFFF", border: "1px solid transparent" }
              : disabled
              ? {
                  background: "var(--bg-elevated)",
                  color: "var(--text-tertiary)",
                  border: "1px solid var(--border-subtle)",
                  cursor: "not-allowed",
                }
              : {
                  background: "var(--bg-surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }
            return (
              <button
                key={p.company}
                onClick={() => toggle(p.company)}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                style={buttonStyle}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: isOn ? "rgba(255,255,255,0.7)" : color }}
                />
                {name}
                <span
                  className="font-mono tabular-nums text-[10px]"
                  style={{ color: isOn ? "rgba(255,255,255,0.7)" : "var(--text-tertiary)" }}
                >
                  {p.total.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Comparison table */}
      {sel.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
        >
          <table className="w-full border-collapse">

            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-subtle)" }}>
                <th className="px-5 py-4 w-[150px]" />
                {sel.map((p) => {
                  const name  = displayName(p.company)
                  const color = companyColor(p.company)
                  return (
                    <th
                      key={p.company}
                      className="px-5 py-4 text-left"
                      style={{ borderLeft: "1px solid var(--border-subtle)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span
                          className="text-[14px] font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {name}
                        </span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>

              {/* Open Roles + weekly delta */}
              <tr style={ROW_BORDER}>
                <RowLabel label="Open Roles" />
                {sel.map((p) => (
                  <Cell key={p.company}>
                    <span
                      className="text-2xl font-mono font-semibold tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {p.total.toLocaleString()}
                    </span>
                    <ChangeDelta change={changes[p.company]} />
                  </Cell>
                ))}
              </tr>

              {/* What's Changed — shift narrative (the week-over-week signal) */}
              {(hasShift || hasChange) && (
                <tr style={{ ...ROW_BORDER, background: ROW_STRIPED_BG }}>
                  <RowLabel label="What's Changed" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.llmSummary?.shift?.length ? (
                        <BulletList items={p.llmSummary.shift} dotColor="var(--accent-amber)" />
                      ) : changes[p.company] && (changes[p.company].new > 0 || changes[p.company].removed > 0) ? (
                        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          {changes[p.company].new} opened, {changes[p.company].removed} closed this week.
                        </span>
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* Role Mix donut */}
              <tr style={ROW_BORDER}>
                <RowLabel label="Role Mix" />
                {sel.map((p) => (
                  <Cell key={p.company}>
                    <RoleMix breakdown={p.categoryBreakdown} total={p.total} />
                  </Cell>
                ))}
              </tr>

              {/* Building Focus */}
              {hasBuilding && (
                <tr style={ROW_BORDER}>
                  <RowLabel label="Building Focus" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.buildingInsights.length > 0 ? (
                        <div className="space-y-1.5">
                          {p.buildingInsights.slice(0, 5).map((ins) => (
                            <div key={ins.subArea} className="flex items-baseline justify-between gap-3">
                              <span
                                className="text-[12px] truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {formatSubArea(ins.subArea)}
                              </span>
                              <span
                                className="text-[11px] font-mono tabular-nums shrink-0"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                {ins.count}
                              </span>
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
                <tr style={{ ...ROW_BORDER, background: ROW_STRIPED_BG }}>
                  <RowLabel label="What They Build" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.llmSummary?.building?.length ? (
                        <BulletList items={p.llmSummary.building} dotColor="var(--accent-blue)" />
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* GTM Focus */}
              {hasSelling && (
                <tr style={ROW_BORDER}>
                  <RowLabel label="GTM Focus" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.sellingInsights.length > 0 ? (
                        <div className="space-y-1.5">
                          {p.sellingInsights.slice(0, 5).map((ins) => (
                            <div key={ins.subArea} className="flex items-baseline justify-between gap-3">
                              <span
                                className="text-[12px] truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {formatSubArea(ins.subArea)}
                              </span>
                              <span
                                className="text-[11px] font-mono tabular-nums shrink-0"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                {ins.count}
                              </span>
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
                <tr style={{ ...ROW_BORDER, background: ROW_STRIPED_BG }}>
                  <RowLabel label="What They Sell" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.llmSummary?.selling?.length ? (
                        <BulletList items={p.llmSummary.selling} dotColor="var(--accent-green)" />
                      ) : <Empty />}
                    </Cell>
                  ))}
                </tr>
              )}

              {/* Verticals */}
              {hasVerticals && (
                <tr style={ROW_BORDER}>
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                                style={{
                                  background: "var(--accent-amber-bg)",
                                  color: "var(--accent-amber)",
                                  border: "1px solid " + tint("#C77F2E", 0.2),
                                }}
                              >
                                {VERTICAL_LABELS[v] ?? v}
                                <span
                                  className="font-mono tabular-nums"
                                  style={{ opacity: 0.7 }}
                                >
                                  {count}
                                </span>
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
                <tr style={{ ...ROW_BORDER, background: ROW_STRIPED_BG }}>
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
                                <p
                                  className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                                  style={{ color: "var(--text-tertiary)" }}
                                >
                                  {VERTICAL_LABELS[vKey] ?? vKey}
                                </p>
                                <BulletList items={bullets} dotColor="var(--accent-amber)" />
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
                <tr style={hasSocialLLM ? ROW_BORDER : undefined}>
                  <RowLabel label="Social Impact" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.socialImpactData.count > 0 ? (
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className="text-[15px] font-mono font-semibold tabular-nums"
                            style={{ color: "var(--accent-green)" }}
                          >
                            {p.socialImpactData.count}
                          </span>
                          <span
                            className="text-[12px]"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            roles
                          </span>
                          <span
                            className="text-[11px] font-mono"
                            style={{ color: "var(--text-tertiary)" }}
                          >
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
                <tr style={{ background: ROW_STRIPED_BG }}>
                  <RowLabel label="Social Notes" />
                  {sel.map((p) => (
                    <Cell key={p.company}>
                      {p.llmSummary?.social_impact_bullets?.length ? (
                        <BulletList items={p.llmSummary.social_impact_bullets} dotColor="var(--accent-green)" />
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
