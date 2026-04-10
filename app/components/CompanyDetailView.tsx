"use client"

import Link from "next/link"
import type { CompanyDetailData, SubAreaDetail, GeoRow } from "../lib/company-detail"

// ── Shared constants ──────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  engineering:  "bg-blue-500",
  research:     "bg-violet-500",
  sales_gtm:    "bg-emerald-500",
  operations:   "bg-amber-400",
  other:        "bg-slate-300",
  unclassified: "bg-slate-200",
}

const CAT_LABEL: Record<string, string> = {
  engineering:  "Engineering",
  research:     "Research",
  sales_gtm:    "Sales / GTM",
  operations:   "Operations",
  other:        "Other",
  unclassified: "Unclassified",
}

// ── Radar (same as CompanyProfiles but larger) ───────────────────────────────

const RADAR_DIMS = [
  { key: "research",    label: "Research" },
  { key: "engineering", label: "Eng" },
  { key: "sales_gtm",   label: "Sales" },
  { key: "operations",  label: "Ops" },
]

function RadarChart({
  breakdown,
  total,
  size = 240,
}: {
  breakdown: Record<string, number>
  total: number
  size?: number
}) {
  const n = RADAR_DIMS.length
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 34
  const lr = r + 16

  const angle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2
  const pt = (i: number, v: number) => ({
    x: cx + v * r * Math.cos(angle(i)),
    y: cy + v * r * Math.sin(angle(i)),
  })

  const gridPath = (lvl: number) =>
    RADAR_DIMS.map((_, i) => {
      const { x, y } = pt(i, lvl)
      return `${i === 0 ? "M" : "L"} ${x} ${y}`
    }).join(" ") + " Z"

  const values = RADAR_DIMS.map((d) => (breakdown[d.key] ?? 0) / total)

  const dataPath =
    values.map((v, i) => {
      const { x, y } = pt(i, v)
      return `${i === 0 ? "M" : "L"} ${x} ${y}`
    }).join(" ") + " Z"

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {[0.25, 0.5, 0.75, 1.0].map((lvl) => (
        <path key={lvl} d={gridPath(lvl)} fill="none"
          stroke={lvl === 1 ? "#e2e8f0" : "#f1f5f9"}
          strokeWidth={lvl === 1 ? 0.75 : 0.5} />
      ))}
      {RADAR_DIMS.map((_, i) => {
        const { x, y } = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={0.75} />
      })}
      <path d={dataPath} fill="rgba(99,102,241,0.1)" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" />
      {values.map((v, i) => {
        const { x, y } = pt(i, v)
        return <circle key={i} cx={x} cy={y} r={3} fill="#6366f1" />
      })}
      {RADAR_DIMS.map((d, i) => {
        const a = angle(i)
        const lx = cx + lr * Math.cos(a)
        const ly = cy + lr * Math.sin(a)
        const pct = Math.round(((breakdown[d.key] ?? 0) / total) * 100)
        return (
          <g key={d.key}>
            <text x={lx} y={ly - 4} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fontWeight={500} fill="#64748b"
              fontFamily="ui-sans-serif, system-ui, sans-serif">{d.label}</text>
            <text x={lx} y={ly + 4} textAnchor="middle" dominantBaseline="middle"
              fontSize={7.5} fill={pct > 0 ? "#94a3b8" : "#cbd5e1"}
              fontFamily="ui-sans-serif, system-ui, sans-serif">
              {pct > 0 ? `${pct}%` : "—"}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Sub-area bar row ──────────────────────────────────────────────────────────

function SubAreaRow({
  area,
  maxCount,
  accentBar,
}: {
  area: SubAreaDetail
  maxCount: number
  accentBar: string
}) {
  const barPct = maxCount > 0 ? (area.count / maxCount) * 100 : 0

  return (
    <div className="py-4 border-b border-slate-100 last:border-0">
      {/* Label + count + bar */}
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[14px] font-medium text-slate-800">{area.label}</span>
        <span className="text-[12px] text-slate-400 tabular-nums">{area.count} roles · {area.pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full mb-3">
        <div className={`h-full rounded-full ${accentBar}`} style={{ width: `${barPct}%` }} />
      </div>

      {/* Sample roles (topTitles — activated from dead code) */}
      {area.topTitles.length > 0 && (
        <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
          <span className="font-medium text-slate-500">Roles: </span>
          {area.topTitles.join("  ·  ")}
        </p>
      )}

      {/* Locations */}
      {area.topLocations.length > 0 && (
        <p className="text-[11px] text-slate-400 mb-2">
          <span className="font-medium text-slate-500">Locations: </span>
          {area.topLocations.join("  ·  ")}
        </p>
      )}

      {/* What samples (filtered: no "Classification failed." entries) */}
      {area.whatSamples.length > 0 && (
        <ul className="space-y-1 mt-2">
          {area.whatSamples.map((w, i) => (
            <li key={i} className="flex gap-1.5 items-start">
              <span className="text-slate-300 mt-[3px] shrink-0">—</span>
              <span className="text-[12px] text-slate-500 leading-relaxed">{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Geography row ─────────────────────────────────────────────────────────────

function GeoRow({ row, maxCount }: { row: GeoRow; maxCount: number }) {
  const barPct = maxCount > 0 ? (row.count / maxCount) * 100 : 0
  const catOrder = ["engineering", "research", "sales_gtm", "operations", "other", "unclassified"]
  const activeCats = catOrder.filter((c) => (row.byCategory[c] ?? 0) > 0)

  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      {/* City + count */}
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[13px] text-slate-700 truncate">{row.city}</p>
        <span className="text-[12px] text-slate-400 tabular-nums ml-2 shrink-0">{row.count}</span>
      </div>

      {/* Stacked category bar — colors show the breakdown directly on the line */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2" style={{ width: `${barPct}%` }}>
        <div className="flex h-full w-full">
          {activeCats.map((cat) => (
            <div
              key={cat}
              className={CAT_COLOR[cat]}
              style={{ width: `${(row.byCategory[cat] / row.count) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Labels */}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {activeCats.map((cat) => {
          const pct = Math.round((row.byCategory[cat] / row.count) * 100)
          if (pct === 0) return null
          return (
            <span key={cat} className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${CAT_COLOR[cat]}`} />
              {CAT_LABEL[cat]} {pct}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-6 py-5">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-[11px] text-slate-300 tabular-nums">{count} roles</span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Main detail view ──────────────────────────────────────────────────────────

export default function CompanyDetailView({ detail }: { detail: CompanyDetailData }) {
  const {
    company, total, categoryBreakdown,
    llmSummary, buildingAreas, sellingAreas, geoBreakdown,
  } = detail

  const buildingTotal = buildingAreas.reduce((s, a) => s + a.count, 0)
  const sellingTotal  = sellingAreas.reduce((s, a) => s + a.count, 0)
  const maxBuild = buildingAreas[0]?.count ?? 1
  const maxSell  = sellingAreas[0]?.count ?? 1
  const maxGeo   = geoBreakdown[0]?.count ?? 1

  return (
    <div className="px-4 sm:px-6 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="text-[12px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
        <span className="text-slate-200">/</span>
        <span className="text-[12px] text-slate-600">{company}</span>
      </div>

      {/* Header + overview */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-6 py-6">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{company}</h1>
          <span className="text-sm text-slate-400 tabular-nums">{total.toLocaleString()} open roles</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-8 items-start">
          {/* Radar */}
          <div className="shrink-0 mx-auto sm:mx-0">
            <RadarChart breakdown={categoryBreakdown} total={total} size={240} />
          </div>

          <div className="hidden sm:block w-px bg-slate-100 self-stretch" />

          {/* LLM summary */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 self-center">
            {llmSummary?.building && llmSummary.building.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500 mb-3">
                  Building
                </p>
                <ul className="space-y-2">
                  {llmSummary.building.map((b, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span className="text-[13px] text-slate-600 leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {llmSummary?.selling && llmSummary.selling.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-3">
                  Selling
                </p>
                <ul className="space-y-2">
                  {llmSummary.selling.map((b, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-[13px] text-slate-600 leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Three-column deep-dive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* Building */}
        {buildingAreas.length > 0 && (
          <Section title="Building & Research" count={buildingTotal}>
            {buildingAreas.map((area) => (
              <SubAreaRow key={area.subArea} area={area} maxCount={maxBuild} accentBar="bg-indigo-400" />
            ))}
          </Section>
        )}

        {/* Selling */}
        {sellingAreas.length > 0 && (
          <Section title="Sales & GTM" count={sellingTotal}>
            {sellingAreas.map((area) => (
              <SubAreaRow key={area.subArea} area={area} maxCount={maxSell} accentBar="bg-emerald-400" />
            ))}
          </Section>
        )}

        {/* Geography */}
        {geoBreakdown.length > 0 && (
          <Section title="Hiring Geography">
            {geoBreakdown.map((row) => (
              <GeoRow key={row.city} row={row} maxCount={maxGeo} />
            ))}
          </Section>
        )}

      </div>

    </div>
  )
}
