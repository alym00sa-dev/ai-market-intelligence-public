"use client"

import { useState } from "react"
import type { ComputeData, EpochFacility, AnnouncedInvestment, LinkedSource } from "../types"

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKETS = ["now", "+18m", "+3y"] as const
type Bucket = typeof BUCKETS[number]

const BUCKET_LABELS: Record<string, string> = {
  "now":  "Now  (Jan 2023 – May 2026)",
  "+18m": "+18 Months  (May 2026 – Nov 2027)",
  "+3y":  "+3 Years  (Nov 2027 – May 2029)",
}

const COMPANY_COLORS: Record<string, string> = {
  amazon:    "#fbbf24",
  microsoft: "#60a5fa",
  meta:      "#fb923c",
  openai:    "#34d399",
  anthropic: "#c084fc",
  oracle:    "#f87171",
  nvidia:    "#4ade80",
  google:    "#38bdf8",
  xai:       "#a3e635",
  other:     "#94a3b8",
}

const COUNTRIES = ["US", "UAE", "CN", "UK", "PT"]

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtMW(mw: number | null): string {
  if (!mw) return "—"
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`
  return `${Math.round(mw)} MW`
}

function fmtH100(n: number | null): string {
  if (!n) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M H100e`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K H100e`
  return `${Math.round(n)} H100e`
}

function fmtCapex(b: number | null): string {
  if (!b) return "—"
  return `$${b.toFixed(1)}B`
}

function fmtDate(d: string | null): string {
  if (!d) return "Unknown"
  try {
    return new Date(d + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })
  } catch { return d }
}

// ── Stats bar ─────────────────────────────────────────────────────────────────


// ── Heatmap ───────────────────────────────────────────────────────────────────

function HeatmapCell({
  mw, count, maxMW, onClick,
}: {
  mw: number; count: number; maxMW: number; onClick: () => void
}) {
  if (!mw && !count) {
    return <td className="px-2 py-2 text-center text-slate-200 text-xs select-none">—</td>
  }
  const intensity = maxMW > 0 ? Math.min(mw / maxMW, 1) : 0
  const bg = `rgba(99, 102, 241, ${0.08 + intensity * 0.72})`
  const textColor = intensity > 0.5 ? "text-white" : "text-slate-700"

  return (
    <td className="px-2 py-2 text-center">
      <button
        onClick={onClick}
        style={{ background: bg }}
        className={`rounded-lg px-2 py-1.5 w-full text-xs font-medium ${textColor} hover:ring-2 hover:ring-indigo-400 transition-all`}
      >
        <div>{fmtMW(mw)}</div>
        {count > 1 && <div className="opacity-70 text-[10px]">{count} sites</div>}
      </button>
    </td>
  )
}

function Heatmap({
  bucket, facilities, onCellClick,
}: {
  bucket: Bucket
  facilities: EpochFacility[]
  onCellClick: (facilities: EpochFacility[]) => void
}) {
  const inBucket = facilities.filter((f) => f.timeline_bucket === bucket)

  const byCompany: Record<string, EpochFacility[]> = {}
  for (const f of inBucket) {
    byCompany[f.company_key] = [...(byCompany[f.company_key] ?? []), f]
  }

  const companies = Object.keys(byCompany).sort((a, b) => {
    const mwA = byCompany[a].reduce((s, f) => s + (f.power_mw ?? 0), 0)
    const mwB = byCompany[b].reduce((s, f) => s + (f.power_mw ?? 0), 0)
    return mwB - mwA
  })

  let maxMW = 0
  for (const co of companies) {
    for (const c of COUNTRIES) {
      const mw = byCompany[co]
        .filter((f) => f.country_short === c || f.country === c)
        .reduce((s, f) => s + (f.power_mw ?? 0), 0)
      if (mw > maxMW) maxMW = mw
    }
  }

  if (companies.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic py-6 text-center">
        No satellite-verified facilities in this window
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left px-2 py-2 text-xs font-medium text-slate-500 w-28">Company</th>
            {COUNTRIES.map((c) => (
              <th key={c} className="px-2 py-2 text-xs font-medium text-slate-500 text-center">{c}</th>
            ))}
            <th className="px-2 py-2 text-xs font-medium text-slate-500 text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((co) => {
            const color   = COMPANY_COLORS[co] ?? "#94a3b8"
            const totalMW = byCompany[co].reduce((s, f) => s + (f.power_mw ?? 0), 0)
            return (
              <tr key={co} className="border-t border-slate-100">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-xs font-medium text-slate-700">{byCompany[co][0].company_display}</span>
                  </div>
                </td>
                {COUNTRIES.map((c) => {
                  const cells = byCompany[co].filter((f) => f.country_short === c || f.country === c)
                  const mw    = cells.reduce((s, f) => s + (f.power_mw ?? 0), 0)
                  return (
                    <HeatmapCell
                      key={c}
                      mw={mw}
                      count={cells.length}
                      maxMW={maxMW}
                      onClick={() => onCellClick(cells)}
                    />
                  )
                })}
                <td className="px-2 py-2 text-center text-xs font-semibold text-slate-600">
                  {fmtMW(totalMW)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Drill-down panel ──────────────────────────────────────────────────────────

function SourceCard({ src }: { src: LinkedSource }) {
  const label = src.source_type === "edgar" ? `SEC ${src.source_form || "Filing"}` : "Press Release"
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-medium">{label}</span>
        <span className="text-slate-400">{src.source_date || "—"}</span>
        <span className="text-slate-400 capitalize">{src.source_company}</span>
      </div>
      {src.source_quote && (
        <p className="text-slate-600 leading-relaxed italic">"{src.source_quote}"</p>
      )}
      <div className="flex flex-wrap gap-3 text-slate-500">
        {src.capacity_mw  && <span>⚡ {fmtMW(src.capacity_mw)}</span>}
        {src.capacity_gw  && <span>⚡ {src.capacity_gw} GW</span>}
        {src.capex_billion_usd && <span>💰 ${src.capex_billion_usd.toFixed(1)}B</span>}
        {src.timeline_raw && <span>🗓 {src.timeline_raw}</span>}
      </div>
      {src.source_url && (
        <a href={src.source_url} target="_blank" rel="noreferrer"
          className="block text-indigo-500 hover:text-indigo-700 truncate">
          {src.source_title || src.source_url}
        </a>
      )}
    </div>
  )
}

function DrillDown({ facilities, onClose }: { facilities: EpochFacility[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">
            {facilities.length === 1 ? facilities[0].name : `${facilities.length} Facilities`}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-8">
          {facilities.map((f) => (
            <div key={f.name}>
              {facilities.length > 1 && (
                <h3 className="font-medium text-slate-700 mb-3 text-sm border-b border-slate-100 pb-2">{f.name}</h3>
              )}

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Current Power", value: fmtMW(f.power_mw) },
                  { label: "H100 Equiv.",   value: fmtH100(f.h100_equiv) },
                  { label: "CapEx",          value: fmtCapex(f.capex_b) },
                ].map((s) => (
                  <div key={s.label} className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-sm font-semibold text-slate-800">{s.value}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-slate-500 space-y-1 mb-4">
                <div>
                  <span className="font-medium text-slate-600">Owner: </span>
                  {f.owner.map((o) => `${o.name} (${o.confidence})`).join(", ") || "—"}
                </div>
                <div>
                  <span className="font-medium text-slate-600">Users: </span>
                  {f.users.map((u) => `${u.name} (${u.confidence})`).join(", ") || "—"}
                </div>
                <div><span className="font-medium text-slate-600">Location: </span>{f.address || f.country}</div>
                <div><span className="font-medium text-slate-600">Operational: </span>{fmtDate(f.operational_date)}</div>
                {f.project && <div><span className="font-medium text-slate-600">Project: </span>{f.project}</div>}
              </div>

              {f.linked_sources.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Linked Sources ({f.linked_sources.length})
                  </h4>
                  <div className="space-y-2">
                    {f.linked_sources.map((src, i) => <SourceCard key={i} src={src} />)}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-slate-400 mt-4">
                Capacity figures are satellite-verified by Epoch AI. Linked sources are press releases and SEC filings matched to this facility.
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Announced investments ─────────────────────────────────────────────────────

function AnnouncedTable({ investments }: { investments: AnnouncedInvestment[] }) {
  const withCapacity = investments.filter((i) => i.has_capacity)
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? withCapacity : withCapacity.slice(0, 10)

  if (withCapacity.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-slate-800">Announced Investments</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Press release and SEC filing claims not yet matched to a satellite-verified facility
          </p>
        </div>
        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">
          {withCapacity.length} with capacity data
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {["Company", "Facility", "Location", "Capacity", "CapEx", "Source", "Date"].map((h) => (
                <th key={h} className="text-left px-2 py-2 text-xs font-medium text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((inv, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: COMPANY_COLORS[inv.source_company] ?? "#94a3b8" }} />
                    <span className="text-xs font-medium capitalize">{inv.source_company}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-xs text-slate-600 max-w-[140px] truncate">{inv.facility_name || "—"}</td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {[inv.location_city, inv.location_state, inv.location_country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-2 py-2 text-xs font-medium text-slate-700">
                  {inv.capacity_gw ? `${inv.capacity_gw} GW` : fmtMW(inv.capacity_mw)}
                </td>
                <td className="px-2 py-2 text-xs text-slate-600">
                  {inv.capex_billion_usd ? `$${inv.capex_billion_usd.toFixed(1)}B` : "—"}
                </td>
                <td className="px-2 py-2 text-xs">
                  {inv.source_url ? (
                    <a href={inv.source_url} target="_blank" rel="noreferrer"
                      className="text-indigo-500 hover:text-indigo-700 font-medium uppercase text-[10px]">
                      {inv.source_type === "edgar" ? "SEC" : "PR"}
                    </a>
                  ) : (
                    <span className="text-slate-400 uppercase text-[10px]">
                      {inv.source_type === "edgar" ? "SEC" : "PR"}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-xs text-slate-400">{inv.source_date?.slice(0, 10) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {withCapacity.length > 10 && (
        <button onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs text-indigo-500 hover:text-indigo-700">
          {expanded ? "Show less" : `Show all ${withCapacity.length} investments`}
        </button>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ComputeView({ data }: { data: ComputeData }) {
  const [drillFacilities, setDrillFacilities] = useState<EpochFacility[] | null>(null)
  const [activeBucket, setActiveBucket] = useState<Bucket>("now")

  const builtAt = new Date(data.built_at).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  })

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Frontier AI &middot; Compute Distribution</h1>
        <div className="flex items-center flex-wrap gap-2 text-xs text-slate-400 mt-1">
          <span>
            Data sourced from{" "}
            <span className="text-slate-600 font-medium">Epoch AI</span>
            {", "}
            <span className="text-slate-600 font-medium">SEC Filings</span>
            {", "}
            <span className="text-slate-600 font-medium">Press Releases</span>
            {" "}· Updated {builtAt}
          </span>
        </div>
      </div>

      {/* Heatmaps */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <div className="flex gap-1 mb-5 border-b border-slate-100 pb-4">
          {BUCKETS.map((b) => (
            <button
              key={b}
              onClick={() => setActiveBucket(b)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeBucket === b
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {b === "now" ? "Now" : b}
            </button>
          ))}
        </div>

        <div className="mb-3">
          <h2 className="font-semibold text-slate-800 text-sm">{BUCKET_LABELS[activeBucket]}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Rows = companies · Columns = countries · Cells = current power (MW) · Click any cell to drill down
          </p>
        </div>

        <Heatmap
          bucket={activeBucket}
          facilities={data.facilities}
          onCellClick={(fs) => setDrillFacilities(fs)}
        />
      </div>

      {/* Company summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">By Company — All Verified Facilities</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(data.stats.by_company)
            .sort(([, a], [, b]) => b.power_mw - a.power_mw)
            .map(([key, s]) => (
              <div key={key} className="border border-slate-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COMPANY_COLORS[key] ?? "#94a3b8" }} />
                  <span className="text-xs font-semibold text-slate-700 capitalize">{key}</span>
                </div>
                <div className="text-base font-bold text-slate-800">{fmtMW(s.power_mw)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{fmtH100(s.h100_equiv)}</div>
                <div className="text-[10px] text-slate-400">{s.count} {s.count === 1 ? "facility" : "facilities"}</div>
              </div>
            ))}
        </div>
      </div>

      <AnnouncedTable investments={data.announced_investments} />

      {/* Coverage note */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
        <span className="font-semibold">Coverage gaps: </span>
        OpenAI and Anthropic are not SEC-listed; financial disclosures come from press releases only.
        Announced capacity figures are aspirational — satellite-verified MW may differ significantly.
      </div>

      {drillFacilities && (
        <DrillDown facilities={drillFacilities} onClose={() => setDrillFacilities(null)} />
      )}
    </div>
  )
}
