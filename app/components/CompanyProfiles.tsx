"use client"

import Link from "next/link"
import type { CompanyProfile, SubAreaInsight } from "../types"
import { toSlug } from "../lib/slug"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSubArea(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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
      <path d={dPath} fill="rgba(99,102,241,0.09)" stroke="#6366f1" strokeWidth={1.75} strokeLinejoin="round" />
      {values.map((v, i) => { const { x, y } = pt(i, v); return <circle key={i} cx={x} cy={y} r={2.75} fill="#6366f1" /> })}
      {RADAR_DIMS.map((d, i) => {
        const a = angle(i), lx = cx + lr * Math.cos(a), ly = cy + lr * Math.sin(a)
        const pct = Math.round(((breakdown[d.key] ?? 0) / total) * 100)
        return (
          <g key={d.key}>
            <text x={lx} y={ly - 3.5} textAnchor="middle" dominantBaseline="middle" fontSize={7} fontWeight={500} fill="#64748b" fontFamily="ui-sans-serif, system-ui, sans-serif">{d.label}</text>
            <text x={lx} y={ly + 3.5} textAnchor="middle" dominantBaseline="middle" fontSize={6.5} fill={pct > 0 ? "#94a3b8" : "#cbd5e1"} fontFamily="ui-sans-serif, system-ui, sans-serif">{pct > 0 ? `${pct}%` : "—"}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Bullet lists ──────────────────────────────────────────────────────────────

function LLMBulletList({ label, bullets, accentClass, dotClass }: {
  label: string; bullets: string[]; accentClass: string; dotClass: string
}) {
  if (bullets.length === 0) return null
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${accentClass}`}>{label}</p>
      <ul className="space-y-2">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
            <span className="text-[13px] text-slate-700 leading-relaxed font-[450]">{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FallbackBulletList({ label, insights, accentClass, dotClass }: {
  label: string; insights: SubAreaInsight[]; accentClass: string; dotClass: string
}) {
  if (insights.length === 0) return null
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-widest mb-3 ${accentClass}`}>{label}</p>
      <ul className="space-y-2.5">
        {insights.map((ins) => (
          <li key={ins.subArea} className="flex gap-2 items-start">
            <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
            <div>
              <span className="text-[13px] text-slate-700 font-medium leading-snug">
                {formatSubArea(ins.subArea)}
              </span>
              <span className="text-slate-400 text-[11px] ml-2 tabular-nums">{ins.count} roles</span>
              {ins.locations.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-0.5">{ins.locations.join("  ·  ")}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
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
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600">
          Watch Out
        </p>
        <span className="text-[10px] text-slate-300 italic">
          — LLM asking: what might this hiring pattern signal?
        </span>
      </div>
      <ul className="space-y-2.5">
        {watchOuts.map((h, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-[12.5px] text-slate-600 leading-relaxed">{h}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Company row ───────────────────────────────────────────────────────────────

function CompanyRow({ profile }: { profile: CompanyProfile }) {
  const { company, total, categoryBreakdown, buildingInsights, sellingInsights, llmSummary } = profile
  const hasLLM = llmSummary && (llmSummary.building.length > 0 || llmSummary.selling.length > 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 border-l-[3px] border-l-indigo-200 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-6 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <Link
          href={`/company/${toSlug(company)}`}
          className="text-[17px] font-semibold text-slate-900 tracking-tight hover:text-indigo-600 transition-colors"
        >
          {company} →
        </Link>
        <span className="text-xs text-slate-400 tabular-nums">{total.toLocaleString()} roles</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
        {/* Radar */}
        <div className="shrink-0 mx-auto sm:mx-0">
          <RadarChart breakdown={categoryBreakdown} total={total} size={220} />
        </div>
        <div className="hidden sm:block w-px bg-slate-100 self-stretch" />

        {/* Right column: bullets + watch out */}
        <div className="flex-1 min-w-0 self-center">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {hasLLM ? (
              <>
                <LLMBulletList label="Building" bullets={llmSummary!.building} accentClass="text-indigo-600" dotClass="bg-indigo-400" />
                <LLMBulletList label="Selling"  bullets={llmSummary!.selling}  accentClass="text-emerald-600" dotClass="bg-emerald-400" />
              </>
            ) : (
              <>
                <FallbackBulletList label="Building" insights={buildingInsights} accentClass="text-indigo-600" dotClass="bg-indigo-300" />
                <FallbackBulletList label="Selling"  insights={sellingInsights}  accentClass="text-emerald-600" dotClass="bg-emerald-300" />
              </>
            )}
          </div>

          {/* Watch Out: hypothesis section */}
          <WatchOut profile={profile} />
        </div>
      </div>
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export default function CompanyProfiles({ profiles }: { profiles: CompanyProfile[] }) {
  if (profiles.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <p className="text-[13px] font-semibold text-slate-700">Company Profiles</p>
        <span className="text-[11px] text-slate-400">{profiles.length} companies</span>
      </div>
      <div className="space-y-3">
        {profiles.map((p) => (
          <CompanyRow key={p.company} profile={p} />
        ))}
      </div>
    </div>
  )
}
