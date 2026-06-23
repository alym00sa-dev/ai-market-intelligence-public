"use client"

import { useState, useMemo } from "react"
import type { RepRiskData, RepRiskLab, RepRiskCell, RepRiskIncident, RepRiskSeverity, IncidentAlignment, IncidentResponse, LabAlignmentScore } from "../types"
import { SectionLabel } from "./ds"

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  harmful_outputs:          "Harmful Outputs",
  deployment_due_diligence: "Deployment Care",
  representation_accuracy:  "Honesty & Accuracy",
  data_practices:           "Data Practices",
  regulatory_compliance:    "Regulatory",
  governance_integrity:     "Governance",
  incident_response:        "Incident Response",
  commitment_stability:     "Commitment Stability",
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  harmful_outputs:          "Cases where a lab's models produced dangerous, abusive, or otherwise harmful content — including jailbreaks, CSAM, or facilitated real-world harm.",
  deployment_due_diligence: "Failures to adequately test, assess, or gate model releases before putting them in front of users or high-stakes applications.",
  representation_accuracy:  "Instances where models made false, misleading, or confidently ungrounded claims — including hallucinated citations or factual errors at scale.",
  data_practices:           "Concerns around how training data was sourced, licensed, or handled — including copyright violations, scraping without consent, and privacy exposure.",
  regulatory_compliance:    "Violations of or non-compliance with AI regulations, government orders, consumer protection law, or binding legal standards.",
  governance_integrity:     "Issues with internal oversight, board accountability, or corporate governance — including conflicts of interest and leadership instability.",
  incident_response:        "How a lab handled or disclosed a safety incident after it became public — including delays, denials, or insufficient remediation.",
  commitment_stability:     "Cases where publicly stated safety commitments were quietly walked back, weakened, or abandoned under competitive or commercial pressure.",
}

// Brand-aligned lab colors. Kept in sync with StatsBar / CompanyComparison /
// HiringMap / FrontierModels. TODO: extract to app/lib/brand-colors.ts.
const LAB_COLORS: Record<string, string> = {
  "Anthropic":  "#D97757",   // brand coral
  "OpenAI":     "#10A37F",   // brand green
  "Google":     "#4285F4",   // Google blue
  "Meta":       "#1877F2",   // Meta blue
  "Microsoft":  "#00A4EF",   // Microsoft cyan
  "Nvidia":     "#76B900",   // NVIDIA green
}

const SOURCE_LABELS: Record<string, string> = {
  aiid:         "AI Incident Database",
  websearch:    "Web Search",
  guardian:     "The Guardian",
  eu_ai_office: "EU AI Office",
  nyt:          "New York Times",
  newsapi:      "NewsAPI",
}

const KNOWN_DOMAINS: Record<string, string> = {
  "theguardian.com":       "The Guardian",
  "nytimes.com":           "New York Times",
  "washingtonpost.com":    "Washington Post",
  "wsj.com":               "Wall Street Journal",
  "bloomberg.com":         "Bloomberg",
  "reuters.com":           "Reuters",
  "bbc.com":               "BBC",
  "bbc.co.uk":             "BBC",
  "techcrunch.com":        "TechCrunch",
  "wired.com":             "Wired",
  "arstechnica.com":       "Ars Technica",
  "theregister.com":       "The Register",
  "venturebeat.com":       "VentureBeat",
  "technologyreview.com":  "MIT Technology Review",
  "ft.com":                "Financial Times",
  "cnbc.com":              "CNBC",
  "cnn.com":               "CNN",
  "npr.org":               "NPR",
  "apnews.com":            "AP News",
  "forbes.com":            "Forbes",
  "time.com":              "Time",
  "theatlantic.com":       "The Atlantic",
  "slate.com":             "Slate",
  "axios.com":             "Axios",
  "politico.com":          "Politico",
  "nature.com":            "Nature",
  "incidentdatabase.ai":   "AI Incident Database",
  "aiid.pub":              "AI Incident Database",
  "euaioffice.europa.eu":  "EU AI Office",
  "europa.eu":             "EU",
  "ftc.gov":               "FTC",
  "congress.gov":          "Congress",
  "senate.gov":            "U.S. Senate",
  "justice.gov":           "DOJ",
  "semafor.com":           "Semafor",
  "theintercept.com":      "The Intercept",
  "vox.com":               "Vox",
  "businessinsider.com":   "Business Insider",
  "independent.co.uk":     "The Independent",
  "economist.com":         "The Economist",
  "statista.com":          "Statista",
  "medium.com":            "Medium",
  "substack.com":          "Substack",
}

const ALIGNMENT_LABELS: Record<string, string> = {
  aligned:     "Aligned",
  partial:     "Partial",
  misaligned:  "Misaligned",
  no_response: "No Response Found",
}

const ALIGNMENT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  aligned:     { bg: "bg-[var(--accent-green-bg)]", text: "text-[var(--accent-green)]", border: "border-[var(--accent-green-bg)]", dot: "bg-[var(--accent-green)]" },
  partial:     { bg: "bg-[var(--accent-amber-bg)]",   text: "text-[var(--accent-amber)]",   border: "border-[var(--accent-amber-bg)]",   dot: "bg-[var(--accent-amber)]"  },
  misaligned:  { bg: "bg-[var(--accent-red-bg)]",     text: "text-[var(--accent-red)]",     border: "border-[var(--accent-red-bg)]",     dot: "bg-[var(--accent-red)]"    },
  no_response: { bg: "bg-[var(--bg-elevated)]",  text: "text-[var(--text-secondary)]",   border: "border-[var(--border-subtle)]",   dot: "bg-[var(--text-tertiary)]"  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function publisherFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "")
    for (const [domain, label] of Object.entries(KNOWN_DOMAINS)) {
      if (hostname === domain || hostname.endsWith("." + domain)) return label
    }
    // fall back to clean "domain.tld"
    const parts = hostname.split(".")
    return parts.length >= 2 ? parts.slice(-2).join(".") : hostname
  } catch {
    return ""
  }
}

function publisherFor(inc: RepRiskIncident): string {
  if (inc.source === "websearch" && inc.url) {
    const pub = publisherFromUrl(inc.url)
    if (pub) return pub
  }
  return SOURCE_LABELS[inc.source] ?? inc.source
}

function cellScore(incidents: RepRiskIncident[] | undefined): number {
  return (incidents ?? []).reduce((s, i) =>
    s + (i.severity === "high" ? 3 : i.severity === "medium" ? 2 : 1), 0)
}

function cellColors(score: number): { bg: string; text: string; border: string } {
  if (score === 0)  return { bg: "bg-[var(--bg-base)]",  text: "text-[var(--text-tertiary)]",  border: "border-[var(--border-subtle)]" }
  if (score <= 4)   return { bg: "bg-[var(--accent-amber-bg)]",  text: "text-[var(--accent-amber)]",  border: "border-[var(--accent-amber-bg)]" }
  if (score <= 12)  return { bg: "bg-[var(--accent-amber-bg)]", text: "text-[var(--accent-amber)]", border: "border-[var(--accent-amber-bg)]" }
  return              { bg: "bg-[var(--accent-red-bg)]",   text: "text-[var(--accent-red)]",    border: "border-[var(--accent-red-bg)]" }
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function fmtQuarter(k: string): string {
  const [y, q] = k.split("-")
  return `${q} '${y.slice(2)}`
}

function incQuarterKey(inc: RepRiskIncident): string | null {
  if (!inc.date) return null
  const d = new Date(inc.date)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

function severityLabel(s: RepRiskSeverity) {
  return s === "high" ? "High" : s === "medium" ? "Medium" : "Low"
}

function severityClasses(s: RepRiskSeverity): string {
  if (s === "high")   return "bg-[var(--accent-red-bg)] text-[var(--accent-red)] border border-[var(--accent-red-bg)]"
  if (s === "medium") return "bg-[var(--accent-amber-bg)] text-[var(--accent-amber)] border border-[var(--accent-amber-bg)]"
  return "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
}

function formatDate(d: string): string {
  if (!d) return ""
  try {
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return ""
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  } catch {
    return ""
  }
}

function computeSummaryStats(data: RepRiskData) {
  let totalIncidents    = 0
  let highSeverityTotal = 0
  let commitmentGaps    = 0
  const categoryTotals: Record<string, number> = {}
  const labHighCounts:  Record<string, number> = {}

  for (const lab of data.labs) {
    for (const [cat, cell] of Object.entries(lab.categories)) {
      const incidents = cell.incidents ?? []
      totalIncidents += incidents.length
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + incidents.length
      const highCount = incidents.filter((i) => i.severity === "high").length
      highSeverityTotal += highCount
      labHighCounts[lab.display_name] = (labHighCounts[lab.display_name] ?? 0) + highCount
      if (incidents.length > 0 && !cell.commitment_present) commitmentGaps++
    }
  }

  const labScores: Record<string, number> = {}
  for (const lab of data.labs) {
    labScores[lab.display_name] = 0
    for (const cell of Object.values(lab.categories)) {
      for (const inc of cell.incidents ?? []) {
        labScores[lab.display_name] += inc.severity === "high" ? 3 : inc.severity === "medium" ? 2 : 1
      }
    }
  }

  const topCat      = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]
  const topLab      = Object.entries(labHighCounts).sort((a, b) => b[1] - a[1])[0]
  const leastRiskLab = Object.entries(labScores).sort((a, b) => a[1] - b[1])[0]
  return { totalIncidents, highSeverityTotal, commitmentGaps, topCat, topLab, leastRiskLab }
}

// ── Alignment scoring helpers ─────────────────────────────────────────────────

const ALIGNMENT_VALUE: Record<IncidentAlignment, number> = {
  aligned: 1.0, partial: 0.5, misaligned: 0, no_response: 0,
}
const SEVERITY_WEIGHT: Record<RepRiskSeverity, number> = {
  high: 3, medium: 2, low: 1,
}

function uniqueLabIncidents(lab: RepRiskLab): RepRiskIncident[] {
  const seen = new Set<string>()
  const out: RepRiskIncident[] = []
  for (const cell of Object.values(lab.categories)) {
    for (const inc of cell.incidents ?? []) {
      if (!inc.title || seen.has(inc.title)) continue
      seen.add(inc.title)
      out.push(inc)
    }
  }
  return out
}

function computeAlignmentScore(incidents: RepRiskIncident[]): LabAlignmentScore | null {
  let aligned = 0, partial = 0, misaligned = 0, no_response = 0
  let totalWeighted = 0
  let alignedSum    = 0
  for (const inc of incidents) {
    if (!inc.response) continue
    const w = inc.response.weight ?? SEVERITY_WEIGHT[inc.severity]
    const v = ALIGNMENT_VALUE[inc.response.alignment]
    totalWeighted += w
    alignedSum    += w * v
    if      (inc.response.alignment === "aligned")    aligned++
    else if (inc.response.alignment === "partial")    partial++
    else if (inc.response.alignment === "misaligned") misaligned++
    else                                              no_response++
  }
  if (totalWeighted === 0) return null
  return {
    score: Math.round((alignedSum / totalWeighted) * 100),
    aligned, partial, misaligned, no_response,
    total_weighted: totalWeighted,
  }
}

function filterIncidentsByDate(
  incidents: RepRiskIncident[],
  from: Date | null,
  to: Date,
): RepRiskIncident[] {
  return incidents.filter(inc => {
    const d = inc.date ? new Date(inc.date) : null
    // Dateless / unparseable incidents can't be placed in a specific window, but they
    // ARE part of "all time" (from == null). This keeps the snapshot's all-time score
    // consistent with the top-of-page score, which counts every incident.
    if (!d || isNaN(d.getTime())) return from == null
    if (from && d < from) return false
    if (d > to) return false
    return true
  })
}

// ── Incident Timeline ─────────────────────────────────────────────────────────

type HoveredPoint   = { lab: string; quarter: string; count: number; cx: number; cy: number }
type HoveredQuarter = { quarter: string; cx: number; topY: number }

function IncidentTimeline({ data }: { data: RepRiskData }) {
  const [mode,           setMode]           = useState<"all" | "by_company">("all")
  const [hoveredPoint,   setHoveredPoint]   = useState<HoveredPoint | null>(null)
  const [hoveredQuarter, setHoveredQuarter] = useState<HoveredQuarter | null>(null)

  const hoveredLab = hoveredPoint?.lab ?? null

  const FROM = new Date("2023-01-01")
  const quarterKey   = (d: Date)   => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
  const quarterLabel = (k: string) => { const [y, q] = k.split("-"); return `${q} '${y.slice(2)}` }

  const quarterlyCounts: Record<string, number> = {}
  const labQuarterlyCounts: Record<string, Record<string, number>> = {}

  for (const lab of data.labs) {
    const name = lab.display_name
    if (!labQuarterlyCounts[name]) labQuarterlyCounts[name] = {}
    for (const cell of Object.values(lab.categories)) {
      for (const inc of cell.incidents ?? []) {
        if (!inc.date) continue
        const d = new Date(inc.date)
        if (d < FROM) continue
        const k = quarterKey(d)
        quarterlyCounts[k] = (quarterlyCounts[k] ?? 0) + 1
        labQuarterlyCounts[name][k] = (labQuarterlyCounts[name][k] ?? 0) + 1
      }
    }
  }

  const keys     = Object.keys(quarterlyCounts).sort()
  if (keys.length === 0) return null

  const W      = 820
  const H      = 240
  const PAD_L  = 46
  const PAD_R  = 16
  const PAD_T  = 16
  const PAD_B  = 36
  const plotW  = W - PAD_L - PAD_R
  const plotH  = H - PAD_T - PAD_B
  const barGap = plotW / keys.length
  const barW   = Math.max(10, barGap * 0.82)

  const maxCount    = Math.max(...Object.values(quarterlyCounts), 1)
  const labNames    = data.labs.map((l) => l.display_name)
  const maxLabCount = Math.max(...labNames.flatMap((n) => Object.values(labQuarterlyCounts[n] ?? {})), 1)

  function makeTicks(maxVal: number) {
    return [0, 0.25, 0.5, 0.75, 1]
      .map((f) => Math.round(f * maxVal))
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a - b)
  }

  function ChartAxes({ maxVal, gridColor = "#DDE3EC" }: { maxVal: number; gridColor?: string }) {
    const ticks = makeTicks(maxVal)
    return (
      <>
        {ticks.map((tick) => {
          const y = PAD_T + plotH - (tick / maxVal) * plotH
          return (
            <g key={tick}>
              <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke={gridColor} strokeWidth={1} />
              <text x={PAD_L - 6} y={y} textAnchor="end" dominantBaseline="middle"
                fontSize={10} fill="#8E97AC" fontFamily="ui-sans-serif,system-ui,sans-serif">{tick}</text>
            </g>
          )
        })}
        <text x={10} y={PAD_T + plotH / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={9} fill="#BCC4D2" fontFamily="ui-sans-serif,system-ui,sans-serif"
          transform={`rotate(-90, 10, ${PAD_T + plotH / 2})`}>Incidents</text>
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#BCC4D2" strokeWidth={1} />
        <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#BCC4D2" strokeWidth={1} />
        {keys.map((k, idx) => {
          if (!k.includes("-Q1") && keys.length > 10) return null
          const cx = PAD_L + idx * barGap + barGap / 2
          return (
            <text key={k} x={cx} y={PAD_T + plotH + 14} textAnchor="middle"
              fontSize={9} fill="#8E97AC" fontFamily="ui-sans-serif,system-ui,sans-serif">
              {quarterLabel(k)}
            </text>
          )
        })}
      </>
    )
  }

  // Pre-compute stacked bar segments
  const stackedBars = keys.map((k, idx) => {
    const cx = PAD_L + idx * barGap + barGap / 2
    let accY = PAD_T + plotH
    const segments: { lab: string; y: number; h: number; color: string }[] = []
    for (const name of labNames) {
      const count = labQuarterlyCounts[name]?.[k] ?? 0
      if (count === 0) continue
      const segH = Math.max((count / maxCount) * plotH, 1)
      accY -= segH
      segments.push({ lab: name, y: accY, h: segH, color: LAB_COLORS[name] ?? "#8E97AC" })
    }
    const total  = quarterlyCounts[k] ?? 0
    const topY   = PAD_T + plotH - (total / maxCount) * plotH
    return { k, idx, cx, segments, total, topY }
  })

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-1">
            Incident Volume by Quarter
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-[var(--text-tertiary)]">Jan 2023 – present</span>
            <span className="w-px h-3 bg-[var(--bg-subtle)] shrink-0" />
            {labNames.map((name) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: LAB_COLORS[name], opacity: 0.85 }} />
                <span className="text-[11px] text-[var(--text-tertiary)]">{name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm rounded-lg p-0.5">
          <button onClick={() => setMode("all")}
            className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${
              mode === "all" ? "bg-[var(--text-primary)] text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}>
            Stacked
          </button>
          <button onClick={() => setMode("by_company")}
            className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${
              mode === "by_company" ? "bg-[var(--text-primary)] text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}>
            By Company
          </button>
        </div>
      </div>

      {mode === "all" ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMinYMid meet"
            className="overflow-visible" role="img" aria-label="Quarterly incident volume stacked by lab"
            onMouseLeave={() => setHoveredQuarter(null)}>
            <ChartAxes maxVal={maxCount} />

            {stackedBars.map(({ k, cx, segments, topY }) => {
              const isHov = hoveredQuarter?.quarter === k
              return (
                <g key={k}
                  onMouseEnter={() => setHoveredQuarter({ quarter: k, cx, topY })}
                  onMouseLeave={() => setHoveredQuarter(null)}>
                  {/* transparent hit area */}
                  <rect x={cx - barW / 2 - 3} y={PAD_T} width={barW + 6} height={plotH} fill="transparent" />
                  {segments.map((seg) => (
                    <rect key={seg.lab} x={cx - barW / 2} y={seg.y} width={barW} height={seg.h}
                      fill={seg.color} opacity={isHov ? 1 : 0.78} />
                  ))}
                </g>
              )
            })}

            {/* Stacked bar tooltip */}
            {hoveredQuarter && (() => {
              const { quarter, cx, topY } = hoveredQuarter
              const breakdown = labNames.filter(n => (labQuarterlyCounts[n]?.[quarter] ?? 0) > 0)
              const ttH = 24 + breakdown.length * 14
              const ttW = 146
              const tx  = Math.min(cx + 10, W - ttW - 4)
              const ty  = Math.max(topY - ttH - 8, PAD_T)
              return (
                <g pointerEvents="none">
                  <rect x={tx} y={ty} width={ttW} height={ttH} rx={5}
                    fill="#0F1E3D"
                    filter="drop-shadow(0 3px 8px rgba(0,0,0,0.18))" />
                  <text x={tx + 10} y={ty + 12} fontSize={10} fontWeight={600} fill="white"
                    fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                    {quarterLabel(quarter)}
                  </text>
                  <text x={tx + ttW - 10} y={ty + 12} fontSize={9} fill="#4A5878" textAnchor="end"
                    fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                    {quarterlyCounts[quarter]} total
                  </text>
                  {breakdown.map((name, i) => (
                    <g key={name}>
                      <circle cx={tx + 13} cy={ty + 22 + i * 14} r={2.5}
                        fill={LAB_COLORS[name]} opacity={0.95} />
                      <text x={tx + 20} y={ty + 22 + i * 14} fontSize={9.5} fill="#BCC4D2"
                        fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                        {name}
                      </text>
                      <text x={tx + ttW - 10} y={ty + 22 + i * 14} fontSize={9.5} fill="white" textAnchor="end"
                        fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle" fontWeight={500}>
                        {labQuarterlyCounts[name]?.[quarter] ?? 0}
                      </text>
                    </g>
                  ))}
                </g>
              )
            })()}
          </svg>

        </>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMinYMid meet"
            className="overflow-visible" role="img" aria-label="Quarterly incident volume by company"
            onMouseLeave={() => setHoveredPoint(null)}>
            <ChartAxes maxVal={maxLabCount} />
            {labNames.map((name) => {
              const labData   = labQuarterlyCounts[name] ?? {}
              const color     = LAB_COLORS[name] ?? "#8E97AC"
              const isHovered = hoveredLab === name
              const dimmed    = hoveredLab !== null && !isHovered
              const points    = keys.map((k, idx) => {
                const cx = PAD_L + idx * barGap + barGap / 2
                const cy = PAD_T + plotH - ((labData[k] ?? 0) / maxLabCount) * plotH
                return `${cx},${cy}`
              }).join(" ")
              return (
                <g key={name}>
                  <polyline points={points} fill="none" stroke={color}
                    strokeWidth={isHovered ? 2.5 : 1.5} strokeLinejoin="round" strokeLinecap="round"
                    opacity={dimmed ? 0.18 : 0.85}
                    style={{ transition: "opacity 0.15s, stroke-width 0.15s" }} />
                  {keys.map((k, idx) => {
                    const count = labData[k] ?? 0
                    const cx = PAD_L + idx * barGap + barGap / 2
                    const cy = PAD_T + plotH - (count / maxLabCount) * plotH
                    return (
                      <g key={k}>
                        <circle cx={cx} cy={cy} r={8} fill="transparent"
                          onMouseEnter={() => setHoveredPoint({ lab: name, quarter: k, count, cx, cy })} />
                        <circle cx={cx} cy={cy} r={isHovered ? 3.5 : 2.5} fill={color}
                          opacity={dimmed ? 0.18 : 0.9}
                          style={{ transition: "opacity 0.15s" }} pointerEvents="none" />
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {hoveredPoint && (() => {
              const ttW = 140, ttH = 38
              const tx  = Math.min(hoveredPoint.cx + 10, W - ttW - 4)
              const ty  = Math.max(hoveredPoint.cy - ttH - 8, PAD_T)
              const color = LAB_COLORS[hoveredPoint.lab] ?? "#8E97AC"
              return (
                <g pointerEvents="none">
                  <rect x={tx} y={ty} width={ttW} height={ttH} rx={5}
                    fill="#0F1E3D"
                    filter="drop-shadow(0 3px 8px rgba(0,0,0,0.18))" />
                  <circle cx={tx + 11} cy={ty + 12} r={3.5} fill={color} />
                  <text x={tx + 19} y={ty + 12} fontSize={10.5} fontWeight={600} fill="white"
                    fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                    {hoveredPoint.lab}
                  </text>
                  <text x={tx + 10} y={ty + 27} fontSize={9.5} fill="#4A5878"
                    fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                    {quarterLabel(hoveredPoint.quarter)}
                  </text>
                  <text x={tx + ttW - 10} y={ty + 27} fontSize={9.5} fill="#DDE3EC" textAnchor="end"
                    fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle" fontWeight={500}>
                    {hoveredPoint.count} incident{hoveredPoint.count !== 1 ? "s" : ""}
                  </text>
                </g>
              )
            })()}
          </svg>

        </>
      )}
    </div>
  )
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({
  lab, catKey, cell, onClose, quarterFilter,
}: {
  lab: RepRiskLab; catKey: string; cell: RepRiskCell; onClose: () => void; quarterFilter: string | null
}) {
  const sorted = [...(cell.incidents ?? [])]
    .filter(inc => !quarterFilter || incQuarterKey(inc) === quarterFilter)
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.severity] - order[b.severity]
    })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-[var(--bg-surface)] shadow-2xl overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-5 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: LAB_COLORS[lab.display_name] ?? "#8E97AC" }} />
              <span className="font-semibold text-[var(--text-primary)] text-[15px]">{lab.display_name}</span>
            </div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 ml-4">{CATEGORY_LABELS[catKey] ?? catKey}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-6 flex-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-3">Stated Commitment</p>
            {cell.commitment_present && cell.commitments.length > 0 ? (
              <ul className="space-y-2">
                {cell.commitments.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-[var(--text-primary)] leading-snug">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--accent-green)] shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--text-tertiary)] italic">No formal commitment documented.</p>
            )}
          </div>

          <div className="border-t border-[var(--border-subtle)]" />

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
              Incidents — {sorted.length}{quarterFilter ? ` · ${fmtQuarter(quarterFilter)}` : ""}
            </p>
            {sorted.length === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)] italic">No incidents found in this category.</p>
            ) : (
              <div className="space-y-5">
                {sorted.map((inc, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${severityClasses(inc.severity)}`}>
                        {severityLabel(inc.severity)}
                      </span>
                      <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">{inc.title || inc.summary.slice(0, 80)}</p>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{inc.summary}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] italic leading-snug">{inc.severity_rationale}</p>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                      <span className="capitalize">{publisherFor(inc)}</span>
                      {formatDate(inc.date) && (
                        <>
                          <span>·</span>
                          <span>{formatDate(inc.date)}</span>
                        </>
                      )}
                      {inc.url && (
                        <>
                          <span>·</span>
                          <a href={inc.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-colors">
                            View source →
                          </a>
                        </>
                      )}
                    </div>
                    {i < sorted.length - 1 && <div className="border-t border-[var(--border-subtle)] mt-1" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Heatmap cell ──────────────────────────────────────────────────────────────

function HeatmapCell({ cell, labColor, quarterFilter, onClick }: { cell: RepRiskCell; labColor: string; quarterFilter: string | null; onClick: () => void }) {
  const incidents = (cell.incidents ?? []).filter(inc =>
    !quarterFilter || incQuarterKey(inc) === quarterFilter
  )
  const score     = cellScore(incidents)

  // Background uses the lab's own color at increasing opacity — not a generic traffic-light palette
  const bgAlpha  = score === 0 ? 0.04 : score <= 4 ? 0.10 : score <= 12 ? 0.22 : 0.38
  const numAlpha = score === 0 ? 0.28 : score <= 4 ? 0.65 : score <= 12 ? 0.85 : 1.0
  const bg       = hexAlpha(labColor, bgAlpha)
  const numColor = hexAlpha(labColor, numAlpha)

  return (
    <td className="px-1 py-1">
      <button
        onClick={onClick}
        className="w-full h-20 rounded-lg border border-white/60 hover:brightness-95 transition-all flex flex-col items-center justify-center relative cursor-pointer overflow-hidden"
        style={{ backgroundColor: bg }}
      >
        {/* Commitment marker — solid green check-style dot when commitment is on file */}
        <span
          className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full"
          style={{
            background: cell.commitment_present
              ? "var(--accent-green)"
              : "transparent",
            border: cell.commitment_present
              ? "1.5px solid rgba(255, 255, 255, 0.85)"
              : "1.5px dashed rgba(15, 30, 61, 0.18)",
            boxShadow: cell.commitment_present
              ? "0 0 0 1px rgba(45, 143, 102, 0.35)"
              : "none",
          }}
          title={cell.commitment_present ? "Commitment on file" : "No formal commitment"}
        />
        <span
          className="font-mono tabular-nums leading-none"
          style={{ color: numColor, fontSize: 22, fontWeight: 600 }}
        >
          {incidents.length === 0 ? "—" : incidents.length}
        </span>
      </button>
    </td>
  )
}

// ── Incident Feed sidebar ─────────────────────────────────────────────────────

type FlatIncident = RepRiskIncident & {
  lab: string
  labColor: string
  catKeys: string[]
  dateMs: number
}

function IncidentFeed({ data }: { data: RepRiskData }) {
  const [filterLab,      setFilterLab]      = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<"all" | RepRiskSeverity>("all")
  const [sort,           setSort]           = useState<"recency" | "severity">("recency")

  const allIncidents = useMemo<FlatIncident[]>(() => {
    // Deduplicate by URL (or title+lab fallback) so an incident appearing in
    // multiple categories shows as one record with all its categories listed.
    const map = new Map<string, FlatIncident>()
    for (const lab of data.labs) {
      for (const [catKey, cell] of Object.entries(lab.categories)) {
        for (const inc of cell.incidents ?? []) {
          const dedupeKey = `${lab.display_name}||${inc.url || inc.title || inc.summary.slice(0, 80)}`
          if (map.has(dedupeKey)) {
            const existing = map.get(dedupeKey)!
            if (!existing.catKeys.includes(catKey)) existing.catKeys.push(catKey)
          } else {
            map.set(dedupeKey, {
              ...inc,
              lab:      lab.display_name,
              labColor: LAB_COLORS[lab.display_name] ?? "#8E97AC",
              catKeys:  [catKey],
              dateMs:   inc.date ? new Date(inc.date).getTime() : 0,
            })
          }
        }
      }
    }
    return Array.from(map.values())
  }, [data])

  const filtered = useMemo(() => {
    return allIncidents
      .filter(inc => !filterLab || inc.lab === filterLab)
      .filter(inc => filterSeverity === "all" || inc.severity === filterSeverity)
      .sort((a, b) => {
        if (sort === "recency") return b.dateMs - a.dateMs
        const order = { high: 0, medium: 1, low: 2 }
        return order[a.severity] - order[b.severity]
      })
  }, [allIncidents, filterLab, filterSeverity, sort])

  const labNames = data.labs.map(l => l.display_name)

  return (
    <div
      className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col"
      style={{ maxHeight: "calc(100vh - 5.5rem)", overflowY: "hidden" }}
    >
      {/* Header + filters */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border-subtle)] shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Incident Feed</h3>
          <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">{filtered.length} incidents</span>
        </div>

        {/* Company filter */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilterLab(null)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
              filterLab === null
                ? "bg-[var(--text-primary)] text-white"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            All
          </button>
          {labNames.map(name => (
            <button
              key={name}
              onClick={() => setFilterLab(filterLab === name ? null : name)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                filterLab === name
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: LAB_COLORS[name] ?? "#8E97AC" }} />
              {name}
            </button>
          ))}
        </div>

        {/* Severity + Sort */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(["all", "high", "medium", "low"] as const).map(v => (
              <button
                key={v}
                onClick={() => setFilterSeverity(v)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  filterSeverity === v
                    ? v === "high"   ? "bg-[var(--accent-red-bg)] text-[var(--accent-red)]"
                    : v === "medium" ? "bg-[var(--accent-amber-bg)] text-[var(--accent-amber)]"
                    : v === "low"    ? "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                    :                  "bg-[var(--text-primary)] text-white"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["recency", "severity"] as const).map(v => (
              <button
                key={v}
                onClick={() => setSort(v)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  sort === v
                    ? "bg-[var(--accent-blue-bg)] text-[var(--accent-blue)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                {v === "recency" ? "Recent" : "Severity"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Incident list */}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--text-tertiary)]">No incidents match.</div>
        ) : (
          filtered.map((inc, i) => (
            <div key={i} className="px-4 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-base)]/70 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: inc.labColor }} />
                  <span className="text-[11px] text-[var(--text-secondary)] font-medium truncate">{inc.lab}</span>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${severityClasses(inc.severity)}`}>
                  {severityLabel(inc.severity)}
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-primary)] font-medium leading-snug line-clamp-2 mb-1">
                {inc.title || inc.summary.slice(0, 90)}
              </p>
              <div className="flex flex-wrap gap-1 mb-1">
                {inc.catKeys.map(k => (
                  <span key={k} className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-elevated)] rounded px-1.5 py-0.5 leading-none">
                    {CATEGORY_LABELS[k] ?? k}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                {formatDate(inc.date) && (
                  <>
                    <span>{formatDate(inc.date)}</span>
                    <span>·</span>
                  </>
                )}
                <span>{publisherFor(inc)}</span>
                {inc.url && (
                  <>
                    <span>·</span>
                    <a href={inc.url} target="_blank" rel="noopener noreferrer"
                      className="text-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-colors font-medium">
                      View →
                    </a>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Response Kanban ───────────────────────────────────────────────────────────

type KanbanCard = {
  lab: string
  labColor: string
  catKey: string
  incident: RepRiskIncident
  severityWeight: number
}

const ALIGNMENT_ORDER: IncidentAlignment[] = ["aligned", "partial", "misaligned", "no_response"]

function ResponseKanban({ data }: { data: RepRiskData }) {
  const [filterLab,      setFilterLab]      = useState<string>("All Labs")
  const [filterSeverity, setFilterSeverity] = useState<string>("All")

  const allCards = useMemo<KanbanCard[]>(() => {
    const cards: KanbanCard[] = []
    for (const lab of data.labs) {
      for (const [catKey, cell] of Object.entries(lab.categories)) {
        for (const inc of cell.incidents ?? []) {
          if (!inc.response) continue
          cards.push({
            lab:           lab.display_name,
            labColor:      LAB_COLORS[lab.display_name] ?? "#8E97AC",
            catKey,
            incident:      inc,
            severityWeight: inc.severity === "high" ? 3 : inc.severity === "medium" ? 2 : 1,
          })
        }
      }
    }
    return cards
  }, [data])

  if (allCards.length === 0) return null

  const labNames = Array.from(new Set(allCards.map(c => c.lab))).sort()

  const filtered = useMemo(() => {
    return allCards.filter(c => {
      if (filterLab !== "All Labs" && c.lab !== filterLab) return false
      if (filterSeverity !== "All" && c.incident.severity !== filterSeverity.toLowerCase()) return false
      return true
    })
  }, [allCards, filterLab, filterSeverity])

  const columns = useMemo<Record<IncidentAlignment, KanbanCard[]>>(() => {
    const cols: Record<IncidentAlignment, KanbanCard[]> = {
      aligned:     [],
      partial:     [],
      misaligned:  [],
      no_response: [],
    }
    for (const card of filtered) {
      const alignment = card.incident.response!.alignment
      cols[alignment].push(card)
    }
    for (const key of ALIGNMENT_ORDER) {
      cols[key].sort((a, b) => b.severityWeight - a.severityWeight)
    }
    return cols
  }, [filtered])

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filterLab}
          onChange={e => setFilterLab(e.target.value)}
          className="text-[11px] border border-[var(--border-subtle)] rounded-md px-2 py-1 text-[var(--text-secondary)] bg-[var(--bg-surface)] focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="All Labs">All Labs</option>
          {labNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="flex gap-1">
          {(["All", "High", "Medium", "Low"] as const).map(v => (
            <button
              key={v}
              onClick={() => setFilterSeverity(v)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                filterSeverity === v
                  ? v === "High"   ? "bg-[var(--accent-red-bg)] text-[var(--accent-red)]"
                  : v === "Medium" ? "bg-[var(--accent-amber-bg)] text-[var(--accent-amber)]"
                  : v === "Low"    ? "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                  :                  "bg-[var(--text-primary)] text-white"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-2 gap-3">
        {ALIGNMENT_ORDER.map(alignment => {
          const col    = columns[alignment]
          const colors = ALIGNMENT_COLORS[alignment]
          return (
            <div key={alignment} className={`rounded-xl border ${colors.border} ${colors.bg} p-2.5`}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                <span className={`text-[11px] font-semibold ${colors.text}`}>{ALIGNMENT_LABELS[alignment]}</span>
                <span className={`ml-auto text-[10px] tabular-nums font-medium ${colors.text} opacity-70`}>{col.length}</span>
              </div>
              <div className="max-h-[480px] overflow-y-auto space-y-2">
                {col.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-tertiary)] italic py-2 text-center">No incidents</p>
                ) : (
                  col.map((card, i) => (
                    <div key={i} className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-subtle)] px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                      {/* Lab badge + category */}
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white leading-none"
                          style={{ backgroundColor: card.labColor }}
                        >
                          {card.lab}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-elevated)] rounded px-1.5 py-0.5 leading-none">
                          {CATEGORY_LABELS[card.catKey] ?? card.catKey}
                        </span>
                        <span className={`ml-auto shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${severityClasses(card.incident.severity)}`}>
                          {severityLabel(card.incident.severity)}
                        </span>
                      </div>
                      {/* Title */}
                      <p className="text-[12px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2 mb-1.5">
                        {card.incident.title || card.incident.summary.slice(0, 80)}
                      </p>
                      {/* Response action */}
                      <p className="text-[11px] text-[var(--text-secondary)] leading-snug line-clamp-2 mb-1.5">
                        {card.incident.response!.action}
                      </p>
                      {/* Source link */}
                      {card.incident.url && (
                        <a href={card.incident.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-colors">
                          View source →
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Commitment Scatter ────────────────────────────────────────────────────────

function CommitmentScatter({ data, from, to }: {
  data: RepRiskData
  from: Date | null
  to: Date
}) {
  const [hoveredLab,   setHoveredLab]   = useState<string | null>(null)
  const [filteredLabs, setFilteredLabs] = useState<Set<string>>(new Set())

  function toggleLabFilter(labKey: string) {
    setFilteredLabs(prev => {
      const next = new Set(prev)
      if (next.has(labKey)) next.delete(labKey)
      else next.add(labKey)
      return next
    })
  }

  const W     = 600
  const H     = 330
  const PAD_L = 64
  const PAD_T = 30
  const PAD_B = 50
  const PAD_R = 40
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const points = useMemo(() => {
    return data.labs.map(lab => {
      const cells           = Object.values(lab.categories)
      const commitmentCount = cells.filter(c => c.commitment_present).length
      const commitmentX     = (commitmentCount / 8) * 100
      const allIncidents    = uniqueLabIncidents(lab)
      const filtered        = filterIncidentsByDate(allIncidents, from, to)
      const scoreData       = computeAlignmentScore(filtered)
      return {
        name:        lab.display_name,
        labKey:      lab.name,
        commitmentX,
        alignScore:  scoreData?.score ?? null,
        totalIncidents: filtered.length,
        r:           10,
        color:       LAB_COLORS[lab.display_name] ?? "#8E97AC",
        scoreData,
      }
    }).filter(p => p.alignScore !== null)
  }, [data, from, to])

  if (points.length === 0) {
    return (
      <div className="text-xs text-[var(--text-tertiary)] italic px-2 py-8 text-center">
        No incidents with response data in this date range.
      </div>
    )
  }

  function toSvgX(val: number) { return PAD_L + (val / 100) * plotW }
  function toSvgY(val: number) { return PAD_T + plotH - (val / 100) * plotH }

  const ticks = [0, 25, 50, 75, 100]

  // Tooltip position for hovered point
  const hoveredPoint = hoveredLab ? points.find(p => p.name === hoveredLab) : null
  const ttW = 125
  const ttH = hoveredPoint?.scoreData ? 84 : 36
  const hovSvgX = hoveredPoint ? toSvgX(hoveredPoint.commitmentX) : 0
  const hovSvgY = hoveredPoint ? toSvgY(hoveredPoint.alignScore!) : 0
  const ttX     = Math.min(hovSvgX + 14, W - ttW - 4)
  const ttY     = Math.max(hovSvgY - ttH - 10, PAD_T)

  const sortedByScore = [...points].sort((a, b) => (b.alignScore ?? 0) - (a.alignScore ?? 0))

  return (
    <div className="flex gap-6 items-start">
      {/* Scatter SVG — takes remaining width */}
      <div className="flex-1 min-w-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          preserveAspectRatio="xMinYMid meet"
          className="overflow-visible"
          role="img"
          aria-label="Commitment vs response alignment scatter plot"
          onMouseLeave={() => setHoveredLab(null)}
        >
          {/* Grid lines */}
          {ticks.map(t => (
            <g key={`grid-${t}`}>
              <line x1={toSvgX(t)} y1={PAD_T} x2={toSvgX(t)} y2={PAD_T + plotH}
                stroke="#DDE3EC" strokeWidth={1} strokeDasharray={t === 50 ? "4 3" : "2 3"} />
              <line x1={PAD_L} y1={toSvgY(t)} x2={PAD_L + plotW} y2={toSvgY(t)}
                stroke="#DDE3EC" strokeWidth={1} strokeDasharray={t === 50 ? "4 3" : "2 3"} />
            </g>
          ))}

          {/* Quadrant midlines */}
          <line x1={toSvgX(50)} y1={PAD_T} x2={toSvgX(50)} y2={PAD_T + plotH}
            stroke="#BCC4D2" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={PAD_L} y1={toSvgY(50)} x2={PAD_L + plotW} y2={toSvgY(50)}
            stroke="#BCC4D2" strokeWidth={1} strokeDasharray="4 3" />

          {/* Axes */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#8E97AC" strokeWidth={1} />

          {/* Tick labels */}
          {ticks.map(t => (
            <g key={`tick-${t}`}>
              <text x={toSvgX(t)} y={PAD_T + plotH + 14}
                textAnchor="middle" fontSize={10} fill="#4A5878"
                fontFamily="ui-sans-serif,system-ui,sans-serif">{t}</text>
              <text x={PAD_L - 6} y={toSvgY(t)}
                textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#4A5878"
                fontFamily="ui-sans-serif,system-ui,sans-serif">{t}</text>
            </g>
          ))}

          {/* Axis labels */}
          <text x={PAD_L + plotW / 2} y={PAD_T + plotH + 30}
            textAnchor="middle" fontSize={8} fill="#8E97AC"
            fontFamily="ui-sans-serif,system-ui,sans-serif">Commitment Coverage →</text>
          <text x={26} y={PAD_T + plotH / 2}
            textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#8E97AC"
            fontFamily="ui-sans-serif,system-ui,sans-serif"
            transform={`rotate(-90, 26, ${PAD_T + plotH / 2})`}>Response Alignment →</text>

          {/* Quadrant labels */}
          <text x={toSvgX(51)} y={PAD_T + 11} fontSize={8} fill="#8E97AC" fontFamily="ui-sans-serif,system-ui,sans-serif">Broad commitments · follows through</text>
          <text x={PAD_L + 4}  y={PAD_T + 11} fontSize={8} fill="#8E97AC" fontFamily="ui-sans-serif,system-ui,sans-serif">Narrow commitments · responds well</text>
          <text x={toSvgX(51)} y={toSvgY(50) + 13} fontSize={8} fill="#8E97AC" fontFamily="ui-sans-serif,system-ui,sans-serif">Broad commitments · poor follow-through</text>
          <text x={PAD_L + 4}  y={toSvgY(50) + 13} fontSize={8} fill="#8E97AC" fontFamily="ui-sans-serif,system-ui,sans-serif">Narrow commitments · poor response</text>

          {/* Data points */}
          {points.map(p => {
            const cx      = toSvgX(p.commitmentX)
            const cy      = toSvgY(p.alignScore!)
            const isHov   = hoveredLab === p.name
            const active  = filteredLabs.size === 0 || filteredLabs.has(p.labKey)
            const dimmed  = filteredLabs.size > 0 && !active
            return (
              <g key={p.name} style={{ opacity: dimmed ? 0.2 : 1, transition: "opacity 0.15s" }}>
                <circle cx={cx} cy={cy} r={p.r + 6} fill="transparent"
                  onMouseEnter={() => setHoveredLab(p.name)} />
                <circle cx={cx} cy={cy} r={p.r}
                  fill={p.color} fillOpacity={isHov ? 1 : 0.85}
                  stroke="white" strokeWidth={1.5} pointerEvents="none" />
              </g>
            )
          })}

          {/* Tooltip */}
          {hoveredPoint && (() => {
            const sd = hoveredPoint.scoreData
            return (
              <g pointerEvents="none">
                <rect x={ttX} y={ttY} width={ttW} height={ttH} rx={6}
                  fill="#0F1E3D" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.22))" />
                <circle cx={ttX + 10} cy={ttY + 11} r={3.5} fill={hoveredPoint.color} />
                <text x={ttX + 18} y={ttY + 11} fontSize={9} fontWeight={600} fill="white"
                  fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                  {hoveredPoint.name}
                </text>
                <text x={ttX + 10} y={ttY + 22} fontSize={8} fill="#8E97AC"
                  fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                  Commitment: {Math.round(hoveredPoint.commitmentX)}%
                </text>
                <text x={ttX + 10} y={ttY + 32} fontSize={8} fill="#8E97AC"
                  fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                  Alignment: {hoveredPoint.alignScore?.toFixed(1)}
                </text>
                {sd && (["aligned", "partial", "misaligned", "no_response"] as IncidentAlignment[]).map((k, i) => (
                  <g key={k}>
                    <circle cx={ttX + 12} cy={ttY + 44 + i * 11} r={2.5}
                      fill={k === "aligned" ? "#2D8F66" : k === "partial" ? "#C77F2E" : k === "misaligned" ? "#ef4444" : "#8E97AC"} />
                    <text x={ttX + 19} y={ttY + 44 + i * 11} fontSize={8} fill="#BCC4D2"
                      fontFamily="ui-sans-serif,system-ui,sans-serif" dominantBaseline="middle">
                      {ALIGNMENT_LABELS[k]}
                    </text>
                    <text x={ttX + ttW - 7} y={ttY + 44 + i * 11} fontSize={8} fill="white"
                      textAnchor="end" fontFamily="ui-sans-serif,system-ui,sans-serif"
                      dominantBaseline="middle" fontWeight={500}>
                      {sd[k]}
                    </text>
                  </g>
                ))}
              </g>
            )
          })()}
        </svg>
      </div>

      {/* Right panel — lab alignment scores + click-to-filter */}
      <div className="w-56 shrink-0 pt-1 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Alignment Scores</p>
          {filteredLabs.size > 0 && (
            <button onClick={() => setFilteredLabs(new Set())}
              className="text-[10px] text-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-colors">
              Clear
            </button>
          )}
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] -mt-2">Click to filter</p>
        {sortedByScore.map(p => {
          const sd      = p.scoreData
          const total   = sd ? sd.aligned + sd.partial + sd.misaligned + sd.no_response : 0
          const active  = filteredLabs.size === 0 || filteredLabs.has(p.labKey)
          const dimmed  = filteredLabs.size > 0 && !active
          return (
            <button key={p.name}
              onClick={() => toggleLabFilter(p.labKey)}
              onMouseEnter={() => setHoveredLab(p.name)}
              onMouseLeave={() => setHoveredLab(null)}
              style={{ opacity: dimmed ? 0.35 : 1, transition: "opacity 0.15s" }}
              className={`w-full text-left rounded-lg p-2.5 border transition-colors ${
                hoveredLab === p.name || filteredLabs.has(p.labKey)
                  ? "border-[var(--border-medium)] bg-[var(--bg-base)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-base)]/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0 transition-transform"
                    style={{
                      backgroundColor: p.color,
                      transform: filteredLabs.has(p.labKey) ? "scale(1.35)" : "scale(1)",
                      boxShadow: filteredLabs.has(p.labKey) ? `0 0 0 2px white, 0 0 0 3px ${p.color}` : "none",
                    }} />
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{p.name}</span>
                </div>
                <span className="text-[13px] font-bold tabular-nums text-[var(--text-primary)]">
                  {p.alignScore}<span className="text-[10px] font-normal text-[var(--text-tertiary)]">/100</span>
                </span>
              </div>
              {sd && total > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {sd.aligned     > 0 && <div className="bg-[var(--accent-green)]" style={{ width: `${(sd.aligned     / total) * 100}%` }} />}
                  {sd.partial     > 0 && <div className="bg-[var(--accent-amber)]"   style={{ width: `${(sd.partial     / total) * 100}%` }} />}
                  {sd.misaligned  > 0 && <div className="bg-[var(--accent-red)]"     style={{ width: `${(sd.misaligned  / total) * 100}%` }} />}
                  {sd.no_response > 0 && <div className="bg-[var(--bg-subtle)]"   style={{ width: `${(sd.no_response / total) * 100}%` }} />}
                </div>
              )}
            </button>
          )
        })}
        <div className="flex flex-col gap-1 pt-1">
          {([["#2D8F66", "Aligned"], ["#C77F2E", "Partial"], ["#ef4444", "Misaligned"], ["#BCC4D2", "No response"]] as const).map(([color, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Date range slider ─────────────────────────────────────────────────────────

function fmtMonthShort(d: Date): string {
  return `${d.toLocaleDateString("en-US", { month: "short" })} '${String(d.getFullYear()).slice(2)}`
}

function DateRangeSlider({ months, value, onChange }: {
  months: Date[]
  value:  [number, number]
  onChange: (from: number, to: number) => void
}) {
  const max = months.length - 1
  const [fromIdx, toIdx] = value
  const pct = (i: number) => (i / max) * 100
  const thumb =
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none " +
    "[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:bg-[var(--bg-surface)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--border-medium)] " +
    "[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none " +
    "[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full " +
    "[&::-moz-range-thumb]:bg-[var(--bg-surface)] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--border-medium)]"
  return (
    <div className="px-1 max-w-md">
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-1 bg-[var(--bg-subtle)] rounded-full" />
        <div className="absolute h-1 bg-[var(--text-secondary)] rounded-full"
          style={{ left: `${pct(fromIdx)}%`, width: `${pct(toIdx) - pct(fromIdx)}%` }} />
        <input type="range" min={0} max={max} value={fromIdx}
          onChange={e => onChange(Math.min(Number(e.target.value), toIdx), toIdx)}
          className={`absolute inset-0 w-full appearance-none bg-transparent pointer-events-none ${thumb}`} />
        <input type="range" min={0} max={max} value={toIdx}
          onChange={e => onChange(fromIdx, Math.max(Number(e.target.value), fromIdx))}
          className={`absolute inset-0 w-full appearance-none bg-transparent pointer-events-none ${thumb}`} />
      </div>
      <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] tabular-nums mt-1">
        <span>{fmtMonthShort(months[0])}</span>
        <span>{fmtMonthShort(months[max])}</span>
      </div>
    </div>
  )
}

// ── Lab Scorecards ────────────────────────────────────────────────────────────
//
// Promoted to the top of the view: each lab gets a card showing its
// Response Alignment score (the genuine "how are they doing" answer),
// volume context, and a color cue. Replaces the old dark "total incidents"
// stats strip — see design_lessons/view-specific.md.

function tint(hex: string, alpha: number): string {
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return hex
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--text-tertiary)"
  if (score >= 80)   return "var(--accent-green)"
  if (score >= 60)   return "var(--accent-blue)"
  if (score >= 40)   return "var(--accent-amber)"
  return "var(--accent-red)"
}

function scoreLabel(score: number | null): string {
  if (score == null) return "no data"
  if (score >= 80)   return "strong"
  if (score >= 60)   return "decent"
  if (score >= 40)   return "mixed"
  return "weak"
}

type ScoreWindow = "6m" | "12m" | "24m" | "all"

const SCORE_WINDOW_OPTS: { key: ScoreWindow; label: string; months: number | null }[] = [
  { key: "6m",  label: "6mo",       months: 6   },
  { key: "12m", label: "12mo",      months: 12  },
  { key: "24m", label: "24mo",      months: 24  },
  { key: "all", label: "All time",  months: null },
]

function filterByWindow(
  incidents: RepRiskIncident[],
  anchor: Date,
  windowKey: ScoreWindow,
): RepRiskIncident[] {
  const opt = SCORE_WINDOW_OPTS.find(o => o.key === windowKey)
  if (!opt || opt.months == null) return incidents
  const cutoff = new Date(anchor)
  cutoff.setMonth(cutoff.getMonth() - opt.months)
  return incidents.filter(inc => {
    if (!inc.date) return false
    const d = new Date(inc.date)
    if (isNaN(d.getTime())) return false
    return d >= cutoff
  })
}

function LabScorecards({
  data,
  windowKey,
  onWindowChange,
}: {
  data: RepRiskData
  windowKey: ScoreWindow
  onWindowChange: (k: ScoreWindow) => void
}) {
  const anchor = data.generated_at ? new Date(data.generated_at) : new Date()
  const activeOpt = SCORE_WINDOW_OPTS.find(o => o.key === windowKey)!

  const rows = data.labs.map(lab => {
    const allIncidents = uniqueLabIncidents(lab)
    const incidents    = filterByWindow(allIncidents, anchor, windowKey)
    const alignment    = computeAlignmentScore(incidents)
    const highSev      = incidents.filter(i => i.severity === "high").length
    return {
      name:    lab.display_name,
      color:   LAB_COLORS[lab.display_name] ?? "var(--accent-blue)",
      score:   alignment?.score ?? null,
      total:   incidents.length,
      highSev,
      aligned:     alignment?.aligned ?? 0,
      partial:     alignment?.partial ?? 0,
      misaligned:  alignment?.misaligned ?? 0,
      no_response: alignment?.no_response ?? 0,
    }
  })
  // Sort: scored labs first (best to worst), unscored at the end
  rows.sort((a, b) => {
    if (a.score == null && b.score == null) return 0
    if (a.score == null) return 1
    if (b.score == null) return -1
    return b.score - a.score
  })

  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      }}
    >
      {/* Header — section label + time-window toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <SectionLabel as="span">Lab Scorecards</SectionLabel>
          <span
            className="text-[11px] ml-3"
            style={{ color: "var(--text-tertiary)" }}
          >
            Response alignment over the {activeOpt.months ? `last ${activeOpt.months} months` : "full history"}
          </span>
        </div>
        <div
          className="flex items-center gap-1 rounded-md p-0.5"
          style={{ background: "var(--bg-elevated)" }}
        >
          {SCORE_WINDOW_OPTS.map(opt => {
            const active = windowKey === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onWindowChange(opt.key)}
                className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                style={{
                  background: active ? "var(--bg-surface)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="grid gap-3 w-full"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
      {rows.map(r => {
        const sc = scoreColor(r.score)
        return (
          <div
            key={r.name}
            className="rounded-lg px-4 py-3 flex flex-col gap-2"
            style={{
              background: tint(r.color, 0.08),
              border: `1px solid ${tint(r.color, 0.25)}`,
            }}
          >
            {/* Lab header */}
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: r.color }}
              />
              <span
                className="text-[13px] font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {r.name}
              </span>
            </div>

            {/* Big score */}
            <div className="flex items-baseline gap-2">
              <span
                className="font-mono text-[28px] tabular-nums leading-none"
                style={{ color: sc, fontWeight: 600 }}
              >
                {r.score ?? "—"}
              </span>
              <span
                className="text-[10px] uppercase tracking-widest font-semibold"
                style={{ color: sc }}
              >
                {scoreLabel(r.score)}
              </span>
            </div>

            {/* Tiny breakdown bar (aligned / partial / misaligned / no-response) */}
            {r.score != null && (r.aligned + r.partial + r.misaligned + r.no_response > 0) && (
              <div
                className="flex h-1 rounded-full overflow-hidden"
                style={{ background: "var(--bg-elevated)" }}
              >
                {r.aligned     > 0 && <div style={{ background: "var(--accent-green)", width: `${(r.aligned     / (r.aligned + r.partial + r.misaligned + r.no_response)) * 100}%` }} />}
                {r.partial     > 0 && <div style={{ background: "var(--accent-amber)", width: `${(r.partial     / (r.aligned + r.partial + r.misaligned + r.no_response)) * 100}%` }} />}
                {r.misaligned  > 0 && <div style={{ background: "var(--accent-red)",   width: `${(r.misaligned  / (r.aligned + r.partial + r.misaligned + r.no_response)) * 100}%` }} />}
                {r.no_response > 0 && <div style={{ background: "var(--text-tertiary)", width: `${(r.no_response / (r.aligned + r.partial + r.misaligned + r.no_response)) * 100}%` }} />}
              </div>
            )}

            {/* Footer counts */}
            <div
              className="flex items-center justify-between text-[11px] mt-0.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              <span className="font-mono tabular-nums">
                {r.total} {r.total === 1 ? "incident" : "incidents"}
              </span>
              {r.highSev > 0 && (
                <span
                  className="font-mono tabular-nums"
                  style={{ color: "var(--accent-red)" }}
                >
                  {r.highSev} high
                </span>
              )}
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RepRiskView({ data }: { data: RepRiskData }) {
  const [selected,         setSelected]         = useState<{ labIdx: number; catKey: string } | null>(null)
  const [responseView,     setResponseView]     = useState<"kanban" | "snapshot">("kanban")
  const [dateMode,         setDateMode]         = useState<"all" | "custom">("all")
  const [customRange,      setCustomRange]      = useState<[number, number] | null>(null)
  const [showMoreAnalysis, setShowMoreAnalysis] = useState(false)
  const [scoreWindow,      setScoreWindow]      = useState<ScoreWindow>("6m")
  const { totalIncidents, highSeverityTotal } = useMemo(() => computeSummaryStats(data), [data])

  const allQuarters = useMemo(() => {
    const qSet = new Set<string>()
    for (const lab of data.labs)
      for (const cell of Object.values(lab.categories))
        for (const inc of cell.incidents ?? []) {
          if (!inc.date) continue
          const d = new Date(inc.date)
          qSet.add(`${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`)
        }
    return Array.from(qSet).sort()
  }, [data])

  const ALL_TIME = allQuarters.length
  const [timeSlice, setTimeSlice] = useState(ALL_TIME)
  // null = all time; string = show only incidents in that specific quarter
  const quarterFilter: string | null = timeSlice < ALL_TIME ? allQuarters[timeSlice] : null

  const dateFrom = "Jan 2023"
  const anchorDate = useMemo(
    () => (data.generated_at ? new Date(data.generated_at) : new Date()),
    [data.generated_at],
  )
  const dateTo = data.generated_at
    ? anchorDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "present"

  // Available months for date slider — from earliest incident through anchor
  const availableMonths = useMemo(() => {
    let minDate: Date | null = null
    for (const lab of data.labs) {
      for (const inc of uniqueLabIncidents(lab)) {
        if (!inc.date) continue
        const d = new Date(inc.date)
        if (isNaN(d.getTime())) continue
        if (!minDate || d < minDate) minDate = d
      }
    }
    if (!minDate) return [] as Date[]
    const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    const end   = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
    const months: Date[] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      months.push(new Date(cursor))
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return months
  }, [data, anchorDate])

  const customResolved: [number, number] =
    customRange ?? [0, Math.max(0, availableMonths.length - 1)]

  const snapshotFrom: Date | null =
    dateMode === "all" || availableMonths.length === 0
      ? null
      : availableMonths[customResolved[0]]
  const snapshotTo: Date =
    dateMode === "all" || availableMonths.length === 0
      ? anchorDate
      : new Date(
          availableMonths[customResolved[1]].getFullYear(),
          availableMonths[customResolved[1]].getMonth() + 1,
          0, 23, 59, 59,
        )

  const selectedLab  = selected !== null ? data.labs[selected.labIdx] : null
  const selectedCell = selected !== null ? data.labs[selected.labIdx]?.categories[selected.catKey] : null

  return (
    <div className="w-full space-y-6">
      {/* Header */}
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
          Safety Track Record
        </h1>
        <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
          Tracking{" "}
          <span className="font-mono tabular-nums" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {data.labs.length}
          </span>
          {" labs · "}
          <span className="font-mono tabular-nums" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {totalIncidents.toLocaleString()}
          </span>
          {" total incidents · "}
          <span className="font-mono tabular-nums" style={{ color: "var(--accent-red)", fontWeight: 500 }}>
            {highSeverityTotal.toLocaleString()}
          </span>
          {" high severity"}
        </div>
        <div className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
          {dateFrom} – {dateTo}
        </div>
      </div>

      {/* Lab scorecards — the leader's first answer */}
      <LabScorecards
        data={data}
        windowKey={scoreWindow}
        onWindowChange={setScoreWindow}
      />

      {/* Trend analysis (collapsible — IncidentTimeline lives here) */}
      <div>
        <button
          type="button"
          onClick={() => setShowMoreAnalysis(v => !v)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
        >
          {showMoreAnalysis ? "Hide trend analysis" : "Show trend analysis"}
          <span
            className="text-[10px]"
            style={{
              display: "inline-block",
              transform: showMoreAnalysis ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 120ms",
            }}
          >
            ▾
          </span>
        </button>
        {showMoreAnalysis && (
          <div className="mt-3">
            <IncidentTimeline data={data} />
          </div>
        )}
      </div>

      <div className="flex gap-6 items-start">
        {/* LEFT: main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Heatmap — categories as rows, labs as columns */}
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-x-auto">
            <div className="px-5 pt-4 pb-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-6">
              <div className="shrink-0">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Incident Risk Matrix</h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Click any cell for details</p>
              </div>
              {allQuarters.length > 0 && (
                <div className="flex items-center gap-3 flex-1 max-w-sm">
                  <input
                    type="range"
                    min={0}
                    max={ALL_TIME}
                    value={timeSlice}
                    onChange={(e) => setTimeSlice(Number(e.target.value))}
                    className="flex-1 h-1 accent-[var(--accent-blue)] cursor-pointer"
                  />
                  <span className="text-[12px] font-medium text-[var(--text-secondary)] shrink-0 w-20 text-right tabular-nums">
                    {timeSlice < ALL_TIME ? fmtQuarter(allQuarters[timeSlice]) : "All time"}
                  </span>
                </div>
              )}
            </div>
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="px-5 py-3 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Category</span>
                  </th>
                  {data.labs.map((lab) => (
                    <th key={lab.name} className="px-2 py-3 text-center">
                      <span className="text-[11px] font-semibold text-[var(--text-primary)] whitespace-nowrap">{lab.display_name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.categories.map((cat) => (
                  <tr key={cat} className="border-t border-[var(--border-subtle)]">
                    <td className="px-5 py-2">
                      <div className="group/tip relative flex items-start gap-1.5">
                        <span className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                        <button className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                            <path fillRule="evenodd" clipRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" />
                          </svg>
                        </button>
                        <div className="pointer-events-none absolute left-0 top-full mt-1 z-40 hidden group-hover/tip:block bg-[var(--text-primary)] text-white text-[11px] rounded-lg px-3 py-2 w-60 leading-relaxed shadow-xl whitespace-normal">
                          {CATEGORY_DESCRIPTIONS[cat] ?? ""}
                        </div>
                      </div>
                    </td>
                    {data.labs.map((lab, labIdx) => {
                      const cell = lab.categories[cat]
                      if (!cell) return (
                        <td key={lab.name} className="px-1 py-1">
                          <div className="w-full h-16 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]" />
                        </td>
                      )
                      return (
                        <HeatmapCell key={lab.name} cell={cell} labColor={LAB_COLORS[lab.display_name] ?? "#8E97AC"} quarterFilter={quarterFilter} onClick={() => setSelected({ labIdx, catKey: cat })} />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60">
                  <td colSpan={data.labs.length + 1} className="px-5 py-3">
                    <div className="flex items-center justify-center flex-wrap gap-5 text-[11px] text-[var(--text-secondary)]">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Cell intensity</span>
                      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                        <span className="w-3 h-3 rounded inline-block border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />None
                      </div>
                      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                        <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: "rgba(100,116,139,0.18)" }} />Low (1–4)
                      </div>
                      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                        <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: "rgba(100,116,139,0.35)" }} />Moderate (5–12)
                      </div>
                      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                        <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: "rgba(100,116,139,0.55)" }} />High (≥ 13)
                      </div>
                      <span className="text-[var(--text-tertiary)]">|</span>
                      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] inline-block" />Commitment present
                      </div>
                      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                        <span className="w-2 h-2 rounded-full bg-black/10 inline-block" />No commitment
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* RIGHT: incident feed sidebar */}
        <div className="w-72 xl:w-80 shrink-0 sticky top-[88px]">
          <IncidentFeed data={data} />
        </div>
      </div>

      {/* Response Alignment section */}
      {data.labs.some(lab => Object.values(lab.categories).some(cell => cell.incidents?.some(i => i.response))) && (
        <div
          className="rounded-xl px-5 py-5"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
        >
          {/* Section header — SectionLabel + descriptive intro */}
          <div className="mb-4">
            <SectionLabel as="h2">Incident Response Alignment</SectionLabel>
            <p
              className="text-xs mt-1 leading-relaxed"
              style={{ color: "var(--text-tertiary)" }}
            >
              How each lab responded when incidents became public — scored against their stated commitments, weighted by severity.
            </p>
          </div>

          {/* Tabbed view toggle — matches Hiring view tab pattern */}
          <div
            className="flex items-end gap-0 mb-5 -mt-1"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            {([
              { key: "kanban",   label: "Kanban"   },
              { key: "snapshot", label: "Snapshot" },
            ] as const).map(v => {
              const active = responseView === v.key
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setResponseView(v.key)}
                  className="px-4 py-2 text-[13px] font-medium transition-colors -mb-px"
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

          {/* Snapshot controls — scoring formula + date range slider */}
          {responseView === "snapshot" && (
            <div className="mb-4 space-y-3">
              {/* How the score works */}
              <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-base)]/70 border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 space-y-1.5">
                <p>
                  <span className="font-semibold text-[var(--text-primary)]">How the score works.</span>{" "}
                  Every incident counts toward a lab&apos;s score based on two things: how well they responded, and how serious the incident was.
                </p>
                <p>
                  An aligned response earns full credit, a partial response earns half credit, and a misaligned or silent response earns none. High-severity incidents count three times as much as low-severity ones, and medium-severity incidents count twice as much. The final 0–100 number is the share of credit a lab earned out of the maximum possible across all incidents in the selected window.
                </p>
              </div>

              {/* Date mode toggle + summary */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Score window</span>
                <div className="flex gap-1">
                  {(["all", "custom"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setDateMode(m)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                        dateMode === m
                          ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-medium)]"
                          : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {m === "all" ? "All-time" : "Custom"}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)] italic">
                  {dateMode === "all" || availableMonths.length === 0
                    ? "Scoring uses every recorded incident"
                    : `Scoring uses incidents from ${fmtMonthShort(availableMonths[customResolved[0]])} to ${fmtMonthShort(availableMonths[customResolved[1]])}`}
                </span>
              </div>

              {dateMode === "custom" && availableMonths.length >= 2 && (
                <DateRangeSlider
                  months={availableMonths}
                  value={customResolved}
                  onChange={(a, b) => setCustomRange([a, b])} />
              )}
            </div>
          )}

          {responseView === "kanban" ? (
            <ResponseKanban data={data} />
          ) : (
            <CommitmentScatter data={data} from={snapshotFrom} to={snapshotTo} />
          )}
        </div>
      )}

      {/* Detail drawer */}
      {selected !== null && selectedLab && selectedCell && (
        <DetailDrawer
          lab={selectedLab}
          catKey={selected.catKey}
          cell={selectedCell}
          onClose={() => setSelected(null)}
          quarterFilter={quarterFilter}
        />
      )}
    </div>
  )
}
