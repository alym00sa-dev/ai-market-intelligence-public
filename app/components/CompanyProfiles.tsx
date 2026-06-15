"use client"

import Link from "next/link"
import type { CompanyProfile, SubAreaInsight, VerticalBreakdown, SocialImpactData } from "../types"
import { toSlug } from "../lib/slug"
import { SectionLabel, NarrativeBlock, type NarrativeTone } from "./ds"

const TONE_DOT: Record<NarrativeTone, string> = {
  "building":  "var(--accent-blue)",
  "positive":  "var(--accent-green)",
  "watch-out": "var(--accent-amber)",
  "risk":      "var(--accent-red)",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSubArea(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const DISPLAY_NAMES: Record<string, string> = {
  "Microsoft Research": "Microsoft",
  "Amazon AGI":         "Amazon",
}

// ── Radar chart ───────────────────────────────────────────────────────────────

const RADAR_DIMS = [
  { key: "research",    label: "Research" },
  { key: "engineering", label: "Eng"      },
  { key: "sales_gtm",   label: "Sales"    },
  { key: "operations",  label: "Ops"      },
]

function RadarChart({ breakdown, total, size = 220 }: {
  breakdown: Record<string, number>
  total: number
  size?: number
}) {
  const n  = RADAR_DIMS.length
  const cx = size / 2, cy = size / 2
  const r  = size / 2 - 30
  const lr = r + 14

  const angle  = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2
  const pt     = (i: number, v: number) => ({ x: cx + v * r * Math.cos(angle(i)), y: cy + v * r * Math.sin(angle(i)) })
  const gPath  = (lvl: number) => RADAR_DIMS.map((_, i) => { const { x, y } = pt(i, lvl); return `${i === 0 ? "M" : "L"} ${x} ${y}` }).join(" ") + " Z"
  const values = RADAR_DIMS.map((d) => (breakdown[d.key] ?? 0) / total)
  const dPath  = values.map((v, i) => { const { x, y } = pt(i, v); return `${i === 0 ? "M" : "L"} ${x} ${y}` }).join(" ") + " Z"

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {[0.25, 0.5, 0.75, 1.0].map((lvl) => (
        <path key={lvl} d={gPath(lvl)} fill="none" stroke={lvl === 1 ? "#e2e8f0" : "#f1f5f9"} strokeWidth={lvl === 1 ? 0.75 : 0.5} />
      ))}
      {RADAR_DIMS.map((_, i) => { const { x, y } = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={0.75} /> })}
      <path d={dPath} fill="rgba(44, 77, 158, 0.10)" stroke="#2C4D9E" strokeWidth={1.75} strokeLinejoin="round" />
      {values.map((v, i) => { const { x, y } = pt(i, v); return <circle key={i} cx={x} cy={y} r={2.75} fill="#2C4D9E" /> })}
      {RADAR_DIMS.map((d, i) => {
        const a = angle(i), lx = cx + lr * Math.cos(a), ly = cy + lr * Math.sin(a)
        const pct = Math.round(((breakdown[d.key] ?? 0) / total) * 100)
        return (
          <g key={d.key}>
            <text x={lx} y={ly - 3.5} textAnchor="middle" dominantBaseline="middle" fontSize={7} fontWeight={500} fill="#4A5878" fontFamily="var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif">{d.label}</text>
            <text x={lx} y={ly + 3.5} textAnchor="middle" dominantBaseline="middle" fontSize={6.5} fill={pct > 0 ? "#8E97AC" : "#BCC4D2"} fontFamily="var(--font-plex-mono), ui-monospace, monospace">{pct > 0 ? `${pct}%` : "—"}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Bullet lists ──────────────────────────────────────────────────────────────

function LLMBulletList({ label, bullets, tone }: {
  label: string; bullets: string[]; tone: NarrativeTone
}) {
  if (bullets.length === 0) return null
  const dot = TONE_DOT[tone]
  return (
    <NarrativeBlock tone={tone}>
      <SectionLabel>{label}</SectionLabel>
      <ul className="space-y-2 mt-1">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span
              className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: dot }}
            />
            <span
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--text-primary)" }}
            >
              {bullet}
            </span>
          </li>
        ))}
      </ul>
    </NarrativeBlock>
  )
}

function FallbackBulletList({ label, insights, tone }: {
  label: string; insights: SubAreaInsight[]; tone: NarrativeTone
}) {
  if (insights.length === 0) return null
  const dot = TONE_DOT[tone]
  return (
    <NarrativeBlock tone={tone}>
      <SectionLabel>{label}</SectionLabel>
      <ul className="space-y-2 mt-1">
        {insights.map((ins) => (
          <li key={ins.subArea} className="flex gap-2 items-start">
            <span
              className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: dot }}
            />
            <div className="text-[13px] leading-snug">
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {formatSubArea(ins.subArea)}
              </span>
              <span
                className="ml-2 tabular-nums font-mono text-[11px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {ins.count} roles
              </span>
              {ins.locations.length > 0 && (
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {ins.locations.join("  ·  ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </NarrativeBlock>
  )
}

// ── Watch Out: pattern-based hypotheses ───────────────────────────────────────
// Generates 1-2 analytical hypotheses from hiring signals.
// These are inferred from data patterns, not hard facts — labeled accordingly.

function buildWatchOuts(profile: CompanyProfile): string[] {
  const { categoryBreakdown, total, buildingInsights, sellingInsights } = profile

  const researchN  = categoryBreakdown["research"]     ?? 0
  const engN       = categoryBreakdown["engineering"]  ?? 0
  const salesN     = categoryBreakdown["sales_gtm"]    ?? 0
  const opsN       = categoryBreakdown["operations"]   ?? 0
  const buildN     = researchN + engN

  const researchPct = Math.round((researchN / total) * 100)
  const salesPct    = Math.round((salesN    / total) * 100)
  const buildPct    = Math.round((buildN    / total) * 100)
  const opsPct      = Math.round((opsN      / total) * 100)

  const topBuild    = buildingInsights[0]
  const topSell     = sellingInsights[0]
  const hypotheses: string[] = []

  // --- Safety signal: regulatory hedge ---
  const safetyIns = buildingInsights.find((i) =>
    i.subArea.includes("safety") || i.subArea.includes("alignment")
  )
  if (safetyIns && safetyIns.count >= 5) {
    hypotheses.push(
      `${safetyIns.count} safety/alignment roles is a leading indicator of regulatory engagement — labs that scale safety hiring ahead of policy windows tend to help shape the frameworks that follow. Watch for government partnerships or policy papers.`
    )
  }

  // --- Infrastructure concentration: capability bet ---
  const infraIns = buildingInsights.find((i) =>
    i.subArea.includes("infra") || i.subArea.includes("platform")
  )
  if (infraIns && infraIns.count >= 10 && hypotheses.length < 2) {
    hypotheses.push(
      `${infraIns.count} ${formatSubArea(infraIns.subArea)} roles suggest a scaling inflection is being pre-positioned — you don't staff infrastructure ahead of demand unless you're anticipating a step-change in usage. A major capacity expansion or model availability announcement is likely.`
    )
  }

  // --- High research ratio: pre-announcement signature ---
  if (researchPct >= 20 && hypotheses.length < 2) {
    hypotheses.push(
      `Research at ${researchPct}% of all hiring is unusually high for a commercial entity. This is the pre-announcement talent signature — the next major model or capability is likely already in training and not yet public.`
    )
  }

  // --- Sales surge: commercialization phase ---
  if (salesPct >= 25 && hypotheses.length < 2) {
    const topSellStr = topSell ? ` led by ${formatSubArea(topSell.subArea)}` : ""
    hypotheses.push(
      `Sales/GTM at ${salesPct}%${topSellStr} signals the shift from R&D to revenue scaling. The technology bets are likely settled — distribution is now the primary competitive lever, not research output.`
    )
  }

  // --- Extreme build/sell imbalance ---
  if (hypotheses.length < 2 && salesPct > 0 && buildPct > 0) {
    const ratio = buildPct / salesPct
    if (ratio > 3.5) {
      hypotheses.push(
        `${buildPct}% building vs ${salesPct}% selling (${ratio.toFixed(1)}x ratio) is pre-commercial by design. Either a specific product isn't ready, or there's a capability the company believes will be competitively decisive and is keeping in stealth until ready to move.`
      )
    } else if (topBuild && topSell) {
      hypotheses.push(
        `Parallel build (${formatSubArea(topBuild.subArea)}, ${topBuild.count}) and sell (${formatSubArea(topSell.subArea)}, ${topSell.count}) bets running simultaneously signal high conviction and execution pressure — both functions scaling at once is high-risk, high-urgency.`
      )
    }
  }

  // --- Ops spike: corporate event signal ---
  if (opsPct >= 15 && hypotheses.length < 2) {
    hypotheses.push(
      `Operations at ${opsPct}% of hiring suggests internal hardening — legal, finance, and HR at this scale typically precedes a fundraise, major acquisition, or IPO preparation window.`
    )
  }

  // --- Fallback ---
  if (hypotheses.length === 0 && topBuild) {
    hypotheses.push(
      `${formatSubArea(topBuild.subArea)} leads at ${topBuild.count} open roles — this concentration suggests a deliberate capability bet, not diversified exploration. Expect an announcement or product in this area within 6–12 months.`
    )
  }

  return hypotheses.slice(0, 2)
}

function WatchOut({ profile }: { profile: CompanyProfile }) {
  const watchOuts = buildWatchOuts(profile)
  if (watchOuts.length === 0) return null

  return (
    <div
      className="mt-4 pt-4"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <NarrativeBlock tone="watch-out">
        <div className="flex items-center gap-2 mb-2">
          <SectionLabel as="span">Watch Out</SectionLabel>
          <span
            className="text-[10px] italic"
            style={{ color: "var(--text-tertiary)" }}
          >
            — LLM asking: what might this hiring pattern signal?
          </span>
        </div>
        <ul className="space-y-2 mt-1">
          {watchOuts.map((h, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span
                className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: TONE_DOT["watch-out"] }}
              />
              <span
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                {h}
              </span>
            </li>
          ))}
        </ul>
      </NarrativeBlock>
    </div>
  )
}

// ── Vertical Focus ────────────────────────────────────────────────────────────

const VERTICAL_ORDER = ["health_rd", "health_delivery", "agriculture", "education"] as const
const VERTICAL_LABELS: Record<string, string> = {
  health_rd:       "Health R&D",
  health_delivery: "Health Delivery",
  agriculture:     "Agriculture",
  education:       "Edu",
}

const VERTICAL_RADAR_DIMS = VERTICAL_ORDER.map((k) => ({ key: k, label: VERTICAL_LABELS[k] }))

// Strip "CompanyName is/has/builds..." prefix so bullets read as facts, not sentences
function cleanBullet(bullet: string, company: string): string {
  const patterns = [
    `${company} is building `, `${company} is deploying `, `${company} is selling `,
    `${company} is establishing `, `${company} is investing `, `${company} is conducting `,
    `${company} is developing `, `${company} is expanding `, `${company} is creating `,
    `${company} is `, `${company} has `, `${company}'s `,
  ]
  for (const p of patterns) {
    if (bullet.startsWith(p)) {
      const rest = bullet.slice(p.length)
      return rest.charAt(0).toUpperCase() + rest.slice(1)
    }
  }
  return bullet
}

function VerticalRadar({ breakdown, total, size = 110 }: {
  breakdown: VerticalBreakdown; total: number; size?: number
}) {
  const n  = VERTICAL_RADAR_DIMS.length
  const cx = size / 2, cy = size / 2
  const r  = size / 2 - 26
  const lr = r + 14

  const angle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2
  const pt    = (i: number, v: number) => ({ x: cx + v * r * Math.cos(angle(i)), y: cy + v * r * Math.sin(angle(i)) })
  const gPath = (lvl: number) => VERTICAL_RADAR_DIMS.map((_, i) => { const { x, y } = pt(i, lvl); return `${i === 0 ? "M" : "L"} ${x} ${y}` }).join(" ") + " Z"
  const values = VERTICAL_RADAR_DIMS.map((d) => total > 0 ? (breakdown[d.key] ?? 0) / total : 0)
  const dPath  = values.map((v, i) => { const { x, y } = pt(i, v); return `${i === 0 ? "M" : "L"} ${x} ${y}` }).join(" ") + " Z"

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0" overflow="visible">
      {[0.25, 0.5, 0.75, 1.0].map((lvl) => (
        <path key={lvl} d={gPath(lvl)} fill="none" stroke={lvl === 1 ? "#e2e8f0" : "#f1f5f9"} strokeWidth={lvl === 1 ? 0.75 : 0.5} />
      ))}
      {VERTICAL_RADAR_DIMS.map((_, i) => { const { x, y } = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={0.75} /> })}
      <path d={dPath} fill="rgba(199, 127, 46, 0.10)" stroke="#C77F2E" strokeWidth={1.5} strokeLinejoin="round" />
      {values.map((v, i) => { const { x, y } = pt(i, v); return <circle key={i} cx={x} cy={y} r={2.5} fill="#C77F2E" /> })}
      {VERTICAL_RADAR_DIMS.map((d, i) => {
        const a = angle(i), lx = cx + lr * Math.cos(a), ly = cy + lr * Math.sin(a)
        const pct = total > 0 ? Math.round(((breakdown[d.key] ?? 0) / total) * 100) : 0
        const words = d.label.split(" ")
        const hasTwo = words.length > 1
        // Position-aware anchor: left side → end, right side → start, top/bottom → middle
        const anchor = Math.cos(a) < -0.3 ? "end" : Math.cos(a) > 0.3 ? "start" : "middle"
        return (
          <g key={d.key}>
            <text x={lx} y={hasTwo ? ly - 7 : ly - 3.5} textAnchor={anchor} dominantBaseline="middle"
              fontSize={7} fontWeight={500} fill="#4A5878"
              fontFamily="var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif">
              {words[0]}
            </text>
            {hasTwo && (
              <text x={lx} y={ly - 0.5} textAnchor={anchor} dominantBaseline="middle"
                fontSize={7} fontWeight={500} fill="#4A5878"
                fontFamily="var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif">
                {words.slice(1).join(" ")}
              </text>
            )}
            <text x={lx} y={hasTwo ? ly + 6 : ly + 3.5} textAnchor={anchor} dominantBaseline="middle"
              fontSize={6.5} fill={pct > 0 ? "#8E97AC" : "#BCC4D2"}
              fontFamily="var(--font-plex-mono), ui-monospace, monospace">
              {pct > 0 ? `${pct}%` : "—"}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function VerticalBins({ verticalBreakdown, verticalBullets, company }: {
  verticalBreakdown: VerticalBreakdown
  verticalBullets: Record<string, string[]>
  company: string
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {VERTICAL_ORDER.map((v) => {
        const count   = verticalBreakdown[v] ?? 0
        const bullets = (verticalBullets[v] ?? []).map((b) => cleanBullet(b, company))
        return (
          <div
            key={v}
            className="pl-2.5"
            style={{ borderLeft: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-secondary)" }}
              >
                {VERTICAL_LABELS[v]}
              </span>
              {count > 0 && (
                <span
                  className="text-[10px] font-mono tabular-nums shrink-0"
                  style={{ color: "var(--accent-amber)" }}
                >
                  {count}
                </span>
              )}
            </div>
            {bullets.length > 0 ? (
              <ul className="space-y-1">
                {bullets.map((b, i) => (
                  <li key={i} className="flex gap-1.5 items-start">
                    <span
                      className="mt-[6px] w-1 h-1 rounded-full shrink-0"
                      style={{ background: "var(--accent-amber)" }}
                    />
                    <span
                      className="text-[11px] leading-relaxed"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="text-[10.5px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                No data
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Social Impact ─────────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  engineering: "Engineering", research: "Research", sales_gtm: "Sales / GTM",
  operations: "Operations", other: "Other", unclassified: "Other",
}

function SocialImpactRow({ socialImpactData, socialImpactBullets }: {
  socialImpactData: SocialImpactData
  socialImpactBullets: string[]
}) {
  const { count, pct, byCategory } = socialImpactData
  const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0]
  const catLabel = topCat ? (CAT_LABEL[topCat] ?? topCat) : null

  return (
    <div
      className="mt-4 pt-4"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <SectionLabel>Social Impact Roles</SectionLabel>
      <p
        className="text-[11px] italic mb-2.5"
        style={{ color: "var(--text-tertiary)" }}
      >
        Defined as: roles whose primary purpose directly serves the public — AI policy, civic tech, humanitarian work, public health or education access
      </p>
      {count === 0 ? (
        <p
          className="text-[12px] italic"
          style={{ color: "var(--text-tertiary)" }}
        >
          No social impact roles identified in current hiring data
        </p>
      ) : (
        <>
          <p
            className="text-[12px] mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {pct > 0 ? `${pct}%` : `${count}`} of roles
            </span>
            {catLabel && (
              <> · concentrated in <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{catLabel}</span></>
            )}
          </p>
          {socialImpactBullets.length > 0 && (
            <ul className="space-y-1.5">
              {socialImpactBullets.map((b, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span
                    className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "var(--accent-green)" }}
                  />
                  <span
                    className="text-[12px] leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ── Company row ───────────────────────────────────────────────────────────────

function CompanyRow({ profile }: { profile: CompanyProfile }) {
  const { company, total, categoryBreakdown, buildingInsights, sellingInsights,
          llmSummary, verticalBreakdown, socialImpactData } = profile
  const hasLLM = llmSummary && (llmSummary.building.length > 0 || llmSummary.selling.length > 0)
  const verticalBullets = llmSummary?.vertical_bullets ?? {}
  const socialImpactBullets = llmSummary?.social_impact_bullets ?? []

  const totalVertical = VERTICAL_ORDER.reduce((s, v) => s + (verticalBreakdown[v] ?? 0), 0)
  const hasAnyBullets = VERTICAL_ORDER.some((v) => (verticalBullets[v] ?? []).length > 0)
  const showVertical = totalVertical > 0 || hasAnyBullets

  return (
    <div
      className="rounded-xl px-6 py-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderLeft: "2px solid var(--accent-blue)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      }}
    >
      {/* Header — company name + role count + CTA */}
      <div className="flex items-center justify-between mb-5">
        <span
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--text-primary)",
            lineHeight: 1.2,
          }}
        >
          {DISPLAY_NAMES[company] ?? company}
        </span>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-mono tabular-nums"
            style={{ color: "var(--text-tertiary)" }}
          >
            {total.toLocaleString()} roles
          </span>
          <Link
            href={`/company/${toSlug(company)}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors"
            style={{
              color: "var(--accent-blue)",
              background: "var(--accent-blue-bg)",
            }}
          >
            Full analysis
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Row 1: category radar | building/selling + watchout */}
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
        <div className="shrink-0 mx-auto sm:mx-0 w-[220px] flex justify-center">
          <RadarChart breakdown={categoryBreakdown} total={total} size={220} />
        </div>
        <div
          className="hidden sm:block w-px self-stretch"
          style={{ background: "var(--border-subtle)" }}
        />
        <div className="flex-1 min-w-0 self-center">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {hasLLM ? (
              <>
                <LLMBulletList label="Building" bullets={llmSummary!.building} tone="building" />
                <LLMBulletList label="Selling"  bullets={llmSummary!.selling}  tone="positive" />
              </>
            ) : (
              <>
                <FallbackBulletList label="Building" insights={buildingInsights} tone="building" />
                <FallbackBulletList label="Selling"  insights={sellingInsights}  tone="positive" />
              </>
            )}
          </div>
          <WatchOut profile={profile} />
        </div>
      </div>

      {/* Row 2: vertical radar | vertical bins — only when vertical data exists */}
      {showVertical && (
        <div
          className="mt-4 pt-4 flex flex-col sm:flex-row gap-6 sm:gap-8 items-start"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="shrink-0 mx-auto sm:mx-0 w-[220px] flex justify-center items-start px-8">
            {totalVertical > 0 && (
              <VerticalRadar breakdown={verticalBreakdown} total={totalVertical} size={220} />
            )}
          </div>
          <div
          className="hidden sm:block w-px self-stretch"
          style={{ background: "var(--border-subtle)" }}
        />
          <div className="flex-1 min-w-0">
            <SectionLabel>Vertical Focus</SectionLabel>
            <VerticalBins verticalBreakdown={verticalBreakdown} verticalBullets={verticalBullets} company={company} />
          </div>
        </div>
      )}

      {/* Social impact — full width below both rows */}
      <SocialImpactRow socialImpactData={socialImpactData} socialImpactBullets={socialImpactBullets} />
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export default function CompanyProfiles({ profiles }: { profiles: CompanyProfile[] }) {
  if (profiles.length === 0) return null
  return (
    <div>
      <div className="space-y-3">
        {profiles.map((p) => (
          <CompanyRow key={p.company} profile={p} />
        ))}
      </div>
    </div>
  )
}
