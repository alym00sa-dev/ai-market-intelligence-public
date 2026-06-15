"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { SectionLabel, StatusPill } from "./ds"

// ─── Types shared with the server component ────────────────────────────────

export type GovtechCountry = {
  country: string
  code:    string
  values:  Record<string, string>
}
export type ConnectivityCountry = {
  country:          string
  code:             string
  mobile_own?:      number
  smartphone?:      number
  daily_mobile?:    number
  daily_internet?:  number
  digital_payment?: number
  mobile_women?:    number
  mobile_men?:      number
  internet_women?:  number
  internet_men?:    number
  literacy?:        number
  internet_3mo?:    number
}
export type DerivedMetrics = {
  cableCount:     number
  dcActive:       number
  dcConstruction: number
  activeMW:       number
  pipelineMW:     number
}
export type BreakdownData = {
  govtechByCountry: Record<string, GovtechCountry>
  connectByCountry: Record<string, ConnectivityCountry>
  derivedByCountry: Record<string, DerivedMetrics>
  aliases:          Record<string, string>
}

// ─── View toggle ────────────────────────────────────────────────────────────

type ViewMode = "map" | "breakdown" | "timeline"

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: "map",       label: "Map"       },
  { key: "breakdown", label: "Breakdown" },
  { key: "timeline",  label: "Timeline"  },
]

const ComputeMap = dynamic(() => import("./ComputeMap"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full"
      style={{
        height: "calc(100vh - 220px)",
        minHeight: 520,
        background: "#0B132A",
      }}
    />
  ),
})

// ─── Focus geographies (display names — must match what's in our JSONs) ────

const FOCUS_COUNTRIES: { name: string; iso: string; focus: boolean }[] = [
  { name: "Burkina Faso",  iso: "BFA", focus: true },
  { name: "Cameroon",      iso: "CMR", focus: true },
  { name: "Chad",          iso: "TCD", focus: true },
  { name: "DRC",           iso: "COD", focus: true },
  { name: "Ethiopia",      iso: "ETH", focus: true },
  { name: "Ghana",         iso: "GHA", focus: true },
  { name: "India",         iso: "IND", focus: true },
  { name: "Kenya",         iso: "KEN", focus: true },
  { name: "Malawi",        iso: "MWI", focus: true },
  { name: "Mali",          iso: "MLI", focus: true },
  { name: "Mozambique",    iso: "MOZ", focus: true },
  { name: "Niger",         iso: "NER", focus: true },
  { name: "Nigeria",       iso: "NGA", focus: true },
  { name: "Pakistan",      iso: "PAK", focus: true },
  { name: "Rwanda",        iso: "RWA", focus: true },
  { name: "Senegal",       iso: "SEN", focus: true },
  { name: "South Africa",  iso: "ZAF", focus: true },
  { name: "Tanzania",      iso: "TZA", focus: true },
  { name: "Uganda",        iso: "UGA", focus: true },
  { name: "Zambia",        iso: "ZMB", focus: true },
  { name: "Zimbabwe",      iso: "ZWE", focus: true },
]

// ─── Main view ──────────────────────────────────────────────────────────────

export default function ComputeConnectivityView({ breakdown }: { breakdown?: BreakdownData }) {
  const [view, setView] = useState<ViewMode>("map")

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 sm:px-6 py-4">
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "var(--text-primary)",
            lineHeight: 1.15,
          }}
        >
          Compute &amp; Connectivity
        </h1>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-tertiary)" }}>
          Data ingestion in progress — counts and layers will fill in as sources land.
        </p>

        <div
          className="flex items-end gap-0 mt-6"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {VIEW_MODES.map((v) => {
            const active = view === v.key
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className="px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px"
                style={{
                  borderBottom: `2px solid ${active ? "var(--accent-blue)" : "transparent"}`,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  background: "transparent",
                }}
              >
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1">
        {view === "map"       && <ComputeMap />}
        {view === "breakdown" && <BreakdownView breakdown={breakdown} />}
        {view === "timeline"  && <TimelineSkeleton />}
      </div>
    </div>
  )
}

// ─── Breakdown view ─────────────────────────────────────────────────────────

type CellType = "count" | "mw" | "pct" | "score_01" | "score_10" | "gap_pp" | "yesno" | "qualitative"

type IndicatorSpec = {
  id:       string
  label:    string
  group:    "infrastructure" | "connectivity" | "inclusion" | "govtech"
  type:     CellType
  /** Pull the raw value out of a country's data. Return null/undefined for missing. */
  get:      (ctx: { d?: DerivedMetrics; c?: ConnectivityCountry; g?: GovtechCountry }) => number | string | null | undefined
  /** Optional shortDescription for the tooltip on the column header. */
  desc?:    string
}

const COLUMN_GROUPS = [
  { key: "infrastructure", label: "Infrastructure", accent: "var(--accent-blue)"  },
  { key: "connectivity",   label: "Connectivity",   accent: "var(--accent-green)" },
  { key: "inclusion",      label: "Digital Inclusion", accent: "var(--accent-amber)" },
  { key: "govtech",        label: "GovTech",        accent: "var(--accent-red)"   },
] as const

const INDICATORS: IndicatorSpec[] = [
  // Infrastructure — computed from our cables / data-centers GeoJSONs.
  { id: "cables",   label: "Submarine cables",      group: "infrastructure", type: "count", get: ({ d }) => d?.cableCount,     desc: "Number of TeleGeography-tracked submarine cables with a landing point in this country." },
  { id: "dcActive", label: "Active data centers",   group: "infrastructure", type: "count", get: ({ d }) => d?.dcActive,       desc: "Operational frontier AI data centers (Epoch AI Frontier Data Centers)." },
  { id: "activeMW", label: "Active DC capacity",    group: "infrastructure", type: "mw",    get: ({ d }) => d?.activeMW,       desc: "Combined power capacity of operational frontier AI data centers in this country (MW)." },
  { id: "pipeline", label: "DC pipeline",           group: "infrastructure", type: "count", get: ({ d }) => d?.dcConstruction, desc: "Frontier AI data centers under construction or planned (Epoch AI)." },

  // Connectivity — from connectivity-metrics.json.
  { id: "mobile_own",      label: "Mobile ownership",       group: "connectivity", type: "pct", get: ({ c }) => c?.mobile_own,      desc: "% of adults who own a mobile phone (GSMA Consumer Survey)." },
  { id: "smartphone",      label: "Smartphone ownership",   group: "connectivity", type: "pct", get: ({ c }) => c?.smartphone,      desc: "% of adults who own a smartphone (GSMA)." },
  { id: "daily_internet",  label: "Daily internet use",     group: "connectivity", type: "pct", get: ({ c }) => c?.daily_internet,  desc: "% of adults who use the internet daily (GSMA / DHS)." },
  { id: "digital_payment", label: "Digital payments",       group: "connectivity", type: "pct", get: ({ c }) => c?.digital_payment, desc: "% of adults who made or received a digital payment in the past year (Findex 2024)." },

  // Digital Inclusion — gender gaps, signed (positive = men ahead).
  { id: "mobile_gap",   label: "Mobile gap (M−F)",    group: "inclusion", type: "gap_pp", get: ({ c }) => (c?.mobile_men   != null && c?.mobile_women   != null) ? +(c.mobile_men   - c.mobile_women)   .toFixed(1) : undefined, desc: "Gender gap in mobile phone ownership, men minus women (percentage points). Positive = men own more." },
  { id: "internet_gap", label: "Internet gap (M−F)",  group: "inclusion", type: "gap_pp", get: ({ c }) => (c?.internet_men != null && c?.internet_women != null) ? +(c.internet_men - c.internet_women).toFixed(1) : undefined, desc: "Gender gap in internet use, men minus women (percentage points). Positive = men use more." },

  // GovTech — from govtech.json `values` dict (string-typed there).
  { id: "gtmi",   label: "GTMI score",                       group: "govtech", type: "score_01", get: ({ g }) => parseFloatOrNull(g?.values["GTMI Score"]),                            desc: "World Bank GovTech Maturity Index 2025 — composite of four sub-indices. 0–1 scale." },
  { id: "cgsi",   label: "Core Gov Systems",                 group: "govtech", type: "score_01", get: ({ g }) => parseFloatOrNull(g?.values["Core Government Systems Index"]),         desc: "GTMI sub-index — foundational IT systems (cloud, interoperability, financial mgmt, HR, payroll, procurement)." },
  { id: "tii",    label: "Telecom Infra Index (UN)",         group: "govtech", type: "score_10", get: ({ g }) => parseFloatOrNull(g?.values["UN Telecommunication Infrastructure Index"]) != null ? parseFloatOrNull(g?.values["UN Telecommunication Infrastructure Index"])! : undefined, desc: "UN E-Government Survey — Telecom Infrastructure Index. 0–10 scale." },
  { id: "dprot",  label: "Data protection law",              group: "govtech", type: "yesno",    get: ({ g }) => g?.values["Data protection law"],                                    desc: "Country has a data protection law on the books (GTMI 2025)." },
  { id: "ai_eth", label: "AI ethical guidelines",            group: "govtech", type: "yesno",    get: ({ g }) => g?.values["Artificial intelligence ethical guidelines"],             desc: "Government has issued AI ethical guidelines (GTMI 2025)." },
]

function parseFloatOrNull(v: string | undefined | null): number | null {
  if (v == null) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function BreakdownView({ breakdown }: { breakdown?: BreakdownData }) {
  // Resolve each focus country across the three data sources, applying alias
  // mapping (e.g. data sources sometimes use "Congo, Dem. Rep." for our "DRC").
  const rows = useMemo(() => {
    if (!breakdown) return []
    const { govtechByCountry, connectByCountry, derivedByCountry, aliases } = breakdown
    function resolve<T>(name: string, map: Record<string, T>): T | undefined {
      if (map[name]) return map[name]
      // Try reverse-aliasing: a source might key under the alias name.
      for (const [src, dest] of Object.entries(aliases)) {
        if (dest === name && map[src]) return map[src]
      }
      return undefined
    }
    return FOCUS_COUNTRIES.map((fc) => ({
      ...fc,
      g: resolve(fc.name, govtechByCountry),
      c: resolve(fc.name, connectByCountry),
      d: resolve(fc.name, derivedByCountry),
    }))
  }, [breakdown])


  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mb-4">
        <SectionLabel>Country breakdown</SectionLabel>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
          Data sources: TeleGeography (cables) · Epoch AI (data centers) · World Bank GovTech Maturity Index 2025 · Global Findex 2024 · GSMA Intelligence · Digital Gender Gaps 2026 · UN E-Government Survey TII.
        </p>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <table
            className="w-full"
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: 13,
            }}
          >
            <thead>
              {/* Group header row */}
              <tr>
                <th
                  className="sticky left-0 top-0 z-30"
                  style={{
                    background: "var(--bg-elevated)",
                    borderRight: "2px solid var(--border-medium)",
                    borderBottom: "1px solid var(--border-subtle)",
                    minWidth: 200,
                  }}
                />
                {COLUMN_GROUPS.map((g) => {
                  const colCount = INDICATORS.filter((i) => i.group === g.key).length
                  return (
                    <th
                      key={g.key}
                      colSpan={colCount}
                      className="sticky top-0 z-20 px-3 py-2 text-left whitespace-nowrap"
                      style={{
                        background: "var(--bg-elevated)",
                        borderBottom: `2px solid ${g.accent}`,
                        borderRight: "1px solid var(--border-subtle)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: g.accent,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {g.label}
                    </th>
                  )
                })}
              </tr>
              {/* Indicator label row */}
              <tr>
                <th
                  className="sticky left-0 z-20 px-4 py-2 text-left"
                  style={{
                    background: "var(--bg-elevated)",
                    borderRight: "2px solid var(--border-medium)",
                    borderBottom: "1px solid var(--border-subtle)",
                    top: 33,
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Country
                </th>
                {INDICATORS.map((ind) => (
                  <th
                    key={ind.id}
                    title={ind.desc ?? ""}
                    className="sticky z-10 px-3 py-2 text-left whitespace-nowrap"
                    style={{
                      background: "var(--bg-elevated)",
                      borderBottom: "1px solid var(--border-subtle)",
                      borderRight: "1px solid var(--border-subtle)",
                      top: 33,
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {ind.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const stripedBg = rowIdx % 2 === 1 ? "var(--bg-elevated)" : "var(--bg-surface)"
                return (
                  <tr key={row.iso}>
                    <td
                      className="sticky left-0 z-10 px-4 py-2.5 whitespace-nowrap"
                      style={{
                        background: stripedBg,
                        borderRight: "2px solid var(--border-medium)",
                        borderBottom: "1px solid var(--border-subtle)",
                        minWidth: 200,
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        {row.focus && (
                          <span style={{ color: "var(--accent-amber)", fontSize: 11 }}>★</span>
                        )}
                        <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                          {row.name}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                          {row.iso}
                        </span>
                      </div>
                    </td>
                    {INDICATORS.map((ind) => {
                      const raw = ind.get({ d: row.d, c: row.c, g: row.g })
                      return (
                        <td
                          key={ind.id}
                          className="px-3 py-2 whitespace-nowrap"
                          style={{
                            background: stripedBg,
                            borderBottom: "1px solid var(--border-subtle)",
                            borderRight: "1px solid var(--border-subtle)",
                          }}
                        >
                          <Cell type={ind.type} value={raw} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Cell renderers ─────────────────────────────────────────────────────────

function Cell({
  type,
  value,
}: {
  type: CellType
  value: number | string | null | undefined
}) {
  if (value == null || value === "" || value === "–" || (typeof value === "number" && !Number.isFinite(value))) {
    return <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>
  }

  switch (type) {
    case "count": {
      const n = Number(value)
      return (
        <span className="font-mono tabular-nums" style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500 }}>
          {n.toLocaleString()}
        </span>
      )
    }
    case "mw": {
      const n = Number(value)
      if (n === 0) return <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>
      return (
        <span className="font-mono tabular-nums" style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500 }}>
          {n >= 1000 ? `${(n / 1000).toFixed(1)} GW` : `${Math.round(n)} MW`}
        </span>
      )
    }
    case "pct": {
      const n = Math.max(0, Math.min(100, Number(value)))
      return <PctBar value={n} />
    }
    case "score_01": {
      const n = Number(value)
      return <ScoreBadge value={n} max={1} />
    }
    case "score_10": {
      const n = Number(value)
      return <ScoreBadge value={n} max={10} />
    }
    case "gap_pp": {
      const n = Number(value)
      const sign = n > 0 ? "+" : ""
      const color = n > 15 ? "var(--accent-red)" : n > 5 ? "var(--accent-amber)" : "var(--text-secondary)"
      return (
        <span className="font-mono tabular-nums" style={{ color, fontSize: 12, fontWeight: 600 }}>
          {sign}{n.toFixed(1)} pp
        </span>
      )
    }
    case "yesno": {
      const v = String(value).trim().toLowerCase()
      if (v === "yes" || v.startsWith("yes ")) return <StatusPill tone="green">Yes</StatusPill>
      if (v === "no")  return <StatusPill tone="red">No</StatusPill>
      return <StatusPill tone="muted">{String(value)}</StatusPill>
    }
    case "qualitative": {
      const v = String(value).trim()
      const tone =
        v === "Extensive"   ? "green" :
        v === "Significant" ? "blue"  :
        v === "Moderate"    ? "amber" :
        v === "Minimal"     ? "muted" :
        v === "None"        ? "red"   : "muted"
      return <StatusPill tone={tone}>{v}</StatusPill>
    }
  }
}

function PctBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const fillColor =
    pct >= 70 ? "var(--accent-green)" :
    pct >= 40 ? "var(--accent-blue)"  :
    pct >= 20 ? "var(--accent-amber)" :
    "var(--accent-red)"
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)", minWidth: 50 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fillColor }} />
      </div>
      <span className="font-mono tabular-nums text-[11px] shrink-0" style={{ color: "var(--text-primary)", fontWeight: 500, minWidth: 32, textAlign: "right" }}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}

function ScoreBadge({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, value / max))
  // Color shading: low score = amber-red, high score = green
  const bg =
    pct >= 0.8 ? "var(--accent-green-bg)" :
    pct >= 0.6 ? "var(--accent-blue-bg)"  :
    pct >= 0.4 ? "var(--accent-amber-bg)" :
    "var(--accent-red-bg)"
  const color =
    pct >= 0.8 ? "var(--accent-green)" :
    pct >= 0.6 ? "var(--accent-blue)"  :
    pct >= 0.4 ? "var(--accent-amber)" :
    "var(--accent-red)"
  return (
    <span
      className="inline-block font-mono tabular-nums px-2 py-0.5 rounded text-[12px]"
      style={{ background: bg, color, fontWeight: 600, minWidth: 44, textAlign: "center" }}
    >
      {value.toFixed(2)}
    </span>
  )
}

// ─── Timeline view (unchanged for now — wiring is Phase 6) ────────────────

const HORIZONS = [
  { key: "now",  label: "Now",        sub: "verified active" },
  { key: "18m",  label: "+18 Months", sub: "under construction + announced 2025–2026" },
  { key: "36m",  label: "+36 Months", sub: "planned + 2027+ projected" },
] as const

function TimelineSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mb-4">
        <SectionLabel>Capacity timeline</SectionLabel>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
          Composite score per country at three horizons. Methodology drafted in compute_connectivity_plan.md; will calibrate once data lands.
        </p>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                className="px-4 py-3 text-left"
                style={{
                  background: "var(--bg-elevated)",
                  borderBottom: "1px solid var(--border-subtle)",
                  borderRight: "1px solid var(--border-subtle)",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  minWidth: 180,
                }}
              >
                Country
              </th>
              {HORIZONS.map((h) => (
                <th
                  key={h.key}
                  className="px-4 py-3 text-center"
                  style={{
                    background: "var(--bg-elevated)",
                    borderBottom: "1px solid var(--border-subtle)",
                    borderRight: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
                    {h.label}
                  </div>
                  <div className="text-[10px] mt-0.5 italic" style={{ color: "var(--text-tertiary)" }}>
                    {h.sub}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FOCUS_COUNTRIES.map((c, rowIdx) => {
              const stripedBg = rowIdx % 2 === 1 ? "var(--bg-elevated)" : "var(--bg-surface)"
              return (
                <tr key={c.iso}>
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{
                      background: stripedBg,
                      borderBottom: "1px solid var(--border-subtle)",
                      borderRight: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.focus && <span style={{ color: "var(--accent-amber)", fontSize: 11 }}>★</span>}
                      <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                    </div>
                  </td>
                  {HORIZONS.map((h, hi) => (
                    <td
                      key={h.key}
                      className="px-4 py-3 text-center"
                      style={{
                        background: stripedBg,
                        borderBottom: "1px solid var(--border-subtle)",
                        borderRight: "1px solid var(--border-subtle)",
                        color: "var(--text-tertiary)",
                        backgroundImage:
                          hi === 0
                            ? "none"
                            : "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(15, 30, 61, 0.025) 6px, rgba(15, 30, 61, 0.025) 12px)",
                      }}
                    >
                      —
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] mt-3 italic" style={{ color: "var(--text-tertiary)" }}>
        +18 and +36 month projections are based on announced plans and publicly committed infrastructure. Actual delivery timelines vary significantly.
      </p>
    </div>
  )
}
