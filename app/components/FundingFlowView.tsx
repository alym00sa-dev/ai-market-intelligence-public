"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { geoNaturalEarth1, geoPath } from "d3-geo"
import { select } from "d3-selection"
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom"
import { feature } from "topojson-client"
import type { Topology } from "topojson-specification"
import type { FeatureCollection, Geometry } from "geojson"
import countries110m from "world-atlas/countries-110m.json"
import type { FundingData, FundingActivity } from "../types"
import { DownloadableNode } from "./ds/DownloadableNode"

const usd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`
const DONOR = "#2C4D9E", RECIP = "#2D8F66"
const RAMP = ["#EAF3EE", "#BFE0CD", "#84C79E", "#4E9E74", "#226B49"]
const NO_DATA = "#EEF1F5"
const GLOBAL = "Global / multi-country"
const CAT_LABEL: Record<string, string> = {
  governance_policy: "Governance & policy", health_ai: "Health AI", education_skills: "Education & skills",
  capacity_building: "Capacity building", data_systems: "Data systems", research: "Research",
  infrastructure_compute: "Infrastructure / compute", agriculture_ai: "Agriculture AI",
  financial_inclusion: "Financial inclusion", other: "Other",
}
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

// ── Country-scoped aggregation ────────────────────────────────────────────────
// Every visualization reads from here so the country filter drives all of them.
type Agg = {
  totalUsd: number; nActs: number; nDonors: number; nRecips: number
  yearMin: number | null; yearMax: number | null
  byRecipient: { name: string; iso3: string | null; usd: number }[]
  byDonor: { donor: string; usd: number }[]
  bySector: { code: string; usd: number }[]
  byYear: { year: number; usd: number; activities: number }[]
  flows: { donor: string; recipient: string; usd: number }[]
  rows: FundingActivity[]
}
const YEARS = [2023, 2024, 2025, 2026]
function aggregate(activities: FundingActivity[], country: string): Agg {
  const isAll = country === "All"
  const rec = new Map<string, { usd: number; iso3: string | null }>()
  const don = new Map<string, number>()
  const cat = new Map<string, number>()
  const flow = new Map<string, number>()
  const yr = new Map<number, { usd: number; activities: number }>()
  const years = new Set<number>(), donors = new Set<string>(), recips = new Set<string>()
  const rows: FundingActivity[] = []
  let totalUsd = 0
  for (const a of activities) {
    const allocs = isAll ? a.allocations : a.allocations.filter(al => al.name === country)
    if (!allocs.length) continue
    const actUsd = allocs.reduce((s, al) => s + al.usd, 0)
    totalUsd += actUsd
    donors.add(a.donor); don.set(a.donor, (don.get(a.donor) || 0) + actUsd)
    if (a.ai_category) cat.set(a.ai_category, (cat.get(a.ai_category) || 0) + actUsd)
    if (a.year) { years.add(a.year); const cy = yr.get(a.year); if (cy) { cy.usd += actUsd; cy.activities += 1 } else yr.set(a.year, { usd: actUsd, activities: 1 }) }
    for (const al of allocs) {
      const cur = rec.get(al.name); if (cur) cur.usd += al.usd; else rec.set(al.name, { usd: al.usd, iso3: al.iso3 })
      flow.set(`${a.donor}|||${al.name}`, (flow.get(`${a.donor}|||${al.name}`) || 0) + al.usd)
      if (al.name !== GLOBAL) recips.add(al.name)
    }
    rows.push({ ...a, usd: actUsd, recipient: isAll ? a.recipient : country })
  }
  const yrs = [...years].sort((x, y) => x - y)
  return {
    totalUsd, nActs: rows.length, nDonors: donors.size, nRecips: recips.size,
    yearMin: yrs[0] ?? null, yearMax: yrs[yrs.length - 1] ?? null,
    byRecipient: [...rec.entries()].map(([name, v]) => ({ name, iso3: v.iso3, usd: v.usd })).sort((a, b) => b.usd - a.usd),
    byDonor: [...don.entries()].map(([donor, u]) => ({ donor, usd: u })).sort((a, b) => b.usd - a.usd),
    bySector: [...cat.entries()].map(([code, u]) => ({ code, usd: u })).sort((a, b) => b.usd - a.usd),
    byYear: YEARS.map(y => ({ year: y, usd: yr.get(y)?.usd ?? 0, activities: yr.get(y)?.activities ?? 0 })),
    flows: [...flow.entries()].map(([k, u]) => { const [donor, recipient] = k.split("|||"); return { donor, recipient, usd: u } }),
    rows: rows.sort((a, b) => b.usd - a.usd),
  }
}

// ── Searchable recipient combobox (type to filter, or pick) ───────────────────
function CountryCombo({ value, options, onChange }: { value: string; options: { name: string; usd: number }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc)
  }, [])
  const list = useMemo(() => {
    const all = [{ name: "All recipients", usd: NaN }, ...options]
    const s = q.trim().toLowerCase()
    return s ? all.filter(o => o.name.toLowerCase().includes(s)) : all
  }, [options, q])
  const commit = (name: string) => { onChange(name === "All recipients" ? "All" : name); setQ(""); setOpen(false) }
  const label = value === "All" ? "All recipients" : value
  return (
    <div ref={boxRef} className="relative min-w-[240px]">
      <input ref={inputRef} value={open ? q : label} placeholder="Type or select a recipient…"
        onFocus={() => { setQ(""); setHi(0); setOpen(true) }}
        onChange={e => { setQ(e.target.value); setHi(0); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, list.length - 1)) }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          else if (e.key === "Enter") { e.preventDefault(); if (list[hi]) commit(list[hi].name) }
          else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur() }
        }}
        className="w-full px-3 py-1.5 text-sm rounded-md focus:outline-none"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-[280px] overflow-y-auto rounded-md py-1 shadow-lg"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          {list.length ? list.map((o, i) => (
            <button key={o.name} onMouseDown={e => { e.preventDefault(); commit(o.name) }} onMouseEnter={() => setHi(i)}
              className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px]"
              style={{ background: i === hi ? "var(--bg-elevated)" : "transparent", color: "var(--text-primary)" }}>
              <span className="truncate">{o.name}</span>
              {!Number.isNaN(o.usd) && <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: "var(--text-tertiary)" }}>{usd(o.usd)}</span>}
            </button>
          )) : <div className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>No match</div>}
        </div>
      )}
    </div>
  )
}

// Fullscreen ⤢ / close button
function FsBtn({ fs, onClick }: { fs: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="absolute top-2 right-2 z-20 rounded-md flex items-center justify-center"
      style={{ width: 26, height: 26, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
      aria-label={fs ? "Exit fullscreen" : "Fullscreen"} title={fs ? "Exit fullscreen" : "Fullscreen"}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {fs ? <path d="M5 1v4H1M11 1v4h4M5 15v-4H1M11 15v-4h4" /> : <path d="M1 5V1h4M15 5V1h-4M1 11v4h4M15 11v4h-4" />}
      </svg>
    </button>
  )
}

// ── Sankey: top donors → top recipients (hover ribbons for $) ──────────────────
function Sankey({ flows }: { flows: Agg["flows"] }) {
  const W = 820, H = 460, TOPD = 9, TOPR = 12, LM = 132, RM = 150, NW = 11, PAD = 7
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fs, setFs] = useState(false)
  const [hov, setHov] = useState<string | null>(null) // node id ("D:x"/"R:x") or ribbon key
  const [tip, setTip] = useState<{ x: number; y: number; s: string } | null>(null)

  const layout = useMemo(() => {
    const dT = new Map<string, number>(), rT = new Map<string, number>()
    for (const f of flows) { dT.set(f.donor, (dT.get(f.donor) || 0) + f.usd); rT.set(f.recipient, (rT.get(f.recipient) || 0) + f.usd) }
    const top = (m: Map<string, number>, n: number) => new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]))
    const dTop = top(dT, TOPD), rTop = top(rT, TOPR)
    const dn = (d: string) => dTop.has(d) ? d : "Other donors"
    const rn = (r: string) => rTop.has(r) ? r : "Other recipients"
    const link = new Map<string, number>(), dv = new Map<string, number>(), rv = new Map<string, number>()
    for (const f of flows) {
      const d = dn(f.donor), r = rn(f.recipient)
      link.set(`${d}|||${r}`, (link.get(`${d}|||${r}`) || 0) + f.usd)
      dv.set(d, (dv.get(d) || 0) + f.usd); rv.set(r, (rv.get(r) || 0) + f.usd)
    }
    const order = (m: Map<string, number>) => [...m.entries()].sort((a, b) =>
      (a[0].startsWith("Other") ? 1 : 0) - (b[0].startsWith("Other") ? 1 : 0) || b[1] - a[1])
    const donors = order(dv), recips = order(rv)
    const total = (arr: [string, number][]) => arr.reduce((s, [, v]) => s + v, 0)
    const usable = (n: number) => H - PAD * Math.max(0, n - 1) - 4
    const scaleD = usable(donors.length) / Math.max(1, total(donors))
    const scaleR = usable(recips.length) / Math.max(1, total(recips))
    const place = (arr: [string, number][], scale: number, side: "D" | "R") => {
      let y = 2; const m = new Map<string, { y: number; h: number; v: number }>()
      for (const [name, v] of arr) { const h = Math.max(2, v * scale); m.set(`${side}:${name}`, { y, h, v }); y += h + PAD }
      return m
    }
    const dpos = place(donors, scaleD, "D"), rpos = place(recips, scaleR, "R")
    const x0 = LM, x1 = W - RM
    const doff = new Map<string, number>(), roff = new Map<string, number>()
    const ribbons = [...link.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => {
      const [d, r] = k.split("|||"); const dp = dpos.get(`D:${d}`)!, rp = rpos.get(`R:${r}`)!
      const sy = doff.get(d) || 0, ry = roff.get(r) || 0
      doff.set(d, sy + v * scaleD); roff.set(r, ry + v * scaleR)
      return { key: k, dId: `D:${d}`, rId: `R:${r}`, d, r, v, y0: dp.y + sy, h0: v * scaleD, y1: rp.y + ry, h1: v * scaleR }
    })
    return { donors, recips, dpos, rpos, ribbons, x0, x1 }
  }, [flows])

  const { dpos, rpos, ribbons, x0, x1 } = layout
  const ribbonPath = (rb: typeof ribbons[number]) => {
    const xa = x0 + NW, xb = x1, xc = (xa + xb) / 2
    return `M${xa},${rb.y0} C${xc},${rb.y0} ${xc},${rb.y1} ${xb},${rb.y1} L${xb},${rb.y1 + rb.h1} C${xc},${rb.y1 + rb.h1} ${xc},${rb.y0 + rb.h0} ${xa},${rb.y0 + rb.h0} Z`
  }
  const lit = (rb: typeof ribbons[number]) => hov === null || hov === rb.key || hov === rb.dId || hov === rb.rId
  const onRib = (rb: typeof ribbons[number]) => (e: React.MouseEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    setHov(rb.key); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, s: `${rb.d} → ${rb.r}: ${usd(rb.v)}` })
  }

  const svg = (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ height: fs ? "calc(100vh - 90px)" : undefined, display: "block" }}>
      {ribbons.map(rb => (
        <path key={rb.key} d={ribbonPath(rb)} fill={DONOR} fillOpacity={lit(rb) ? (hov === rb.key ? 0.42 : 0.22) : 0.05}
          style={{ cursor: "pointer" }} onMouseMove={onRib(rb)} onMouseLeave={() => { setHov(null); setTip(null) }} />
      ))}
      {[...dpos.entries()].map(([id, p]) => {
        const name = id.slice(2)
        return (
          <g key={id} onMouseEnter={() => setHov(id)} onMouseLeave={() => setHov(null)} style={{ cursor: "default" }}>
            <rect x={x0} y={p.y} width={NW} height={p.h} rx={2} fill={DONOR} fillOpacity={hov === null || hov === id ? 0.95 : 0.4} />
            <text x={x0 - 6} y={p.y + p.h / 2} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#3A4866" fontFamily="ui-sans-serif, system-ui">{short(name, 20)}</text>
          </g>
        )
      })}
      {[...rpos.entries()].map(([id, p]) => {
        const name = id.slice(2)
        return (
          <g key={id} onMouseEnter={() => setHov(id)} onMouseLeave={() => setHov(null)} style={{ cursor: "default" }}>
            <rect x={x1} y={p.y} width={NW} height={p.h} rx={2} fill={RECIP} fillOpacity={hov === null || hov === id ? 0.95 : 0.4} />
            <text x={x1 + NW + 6} y={p.y + p.h / 2} textAnchor="start" dominantBaseline="middle" fontSize={9} fill="#2C5C44" fontFamily="ui-sans-serif, system-ui">{short(name, 22)}</text>
          </g>
        )
      })}
    </svg>
  )
  return (
    <div ref={wrapRef} className={fs ? "fixed inset-0 z-[60] p-4 flex flex-col" : "relative"} style={fs ? { background: "var(--bg-base)" } : undefined}>
      {fs && <div className="flex items-center mb-2"><span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Donor → recipient flows</span></div>}
      <FsBtn fs={fs} onClick={() => setFs(v => !v)} />
      {ribbons.length ? svg : <div className="flex items-center justify-center text-xs h-full py-16" style={{ color: "var(--text-tertiary)" }}>No flows for this selection.</div>}
      {tip && <div className="pointer-events-none absolute z-30 text-[11px] px-2 py-1 rounded" style={{ left: tip.x + 12, top: tip.y + 12, background: "#0F1E3D", color: "#fff" }}>{tip.s}</div>}
    </div>
  )
}

// ── Recipient choropleth (same flat d3-geo setup as the Compute map) ──────────
function RecipientMap({ byRecipient }: { byRecipient: Agg["byRecipient"] }) {
  const W = 820, H = 460
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [t, setT] = useState<ZoomTransform>(zoomIdentity)
  const [fs, setFs] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; s: string } | null>(null)
  const valByName = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of byRecipient) if (r.name !== GLOBAL) m.set(r.name, r.usd)
    return m
  }, [byRecipient])
  const max = Math.max(1, ...valByName.values())
  const fill = (v: number | undefined) => v ? RAMP[Math.floor(Math.min(0.999, Math.log10(v + 1) / Math.log10(max + 1)) * RAMP.length)] : NO_DATA
  const { path, feats } = useMemo(() => {
    const topo = countries110m as unknown as Topology
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name?: string }>
    // Default framing: fit to the recipient (data) countries, not the whole world.
    const dataFeats = fc.features.filter(f => valByName.has(String(f.properties?.name ?? "")))
    const fit: FeatureCollection<Geometry, { name?: string }> = { type: "FeatureCollection", features: dataFeats.length ? dataFeats : fc.features }
    const proj = geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], fit)
    return { path: geoPath(proj), feats: fc.features }
  }, [valByName])
  useEffect(() => {
    if (!svgRef.current) return
    const sel = select(svgRef.current as Element)
    const z = d3zoom<Element, unknown>().scaleExtent([1, 8]).on("zoom", (e) => setT(e.transform))
    sel.call(z as never); return () => { sel.on(".zoom", null) }
  }, [])
  return (
    <div ref={wrapRef} className={fs ? "fixed inset-0 z-[60] p-4 flex flex-col" : "relative"} style={fs ? { background: "var(--bg-base)" } : undefined}>
      {fs && <div className="flex items-center mb-2"><span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>AI aid by recipient country</span></div>}
      <FsBtn fs={fs} onClick={() => setFs(v => !v)} />
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ cursor: "grab", height: fs ? "calc(100vh - 90px)" : undefined, display: "block" }}>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {feats.map((f, i) => {
            const name = String(f.properties?.name ?? ""); const v = valByName.get(name)
            return <path key={i} d={path(f) || ""} fill={fill(v)} stroke="#fff" strokeWidth={0.4} vectorEffect="non-scaling-stroke"
              onMouseMove={v ? (e) => { const r = wrapRef.current!.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, s: `${name}: ${usd(v)}` }) } : undefined}
              onMouseLeave={() => setTip(null)} />
          })}
        </g>
      </svg>
      {(t.k !== 1 || t.x !== 0 || t.y !== 0) && <button onClick={() => setT(zoomIdentity)} className="absolute top-2 right-10 text-[10px] rounded px-2 py-0.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>Reset</button>}
      {tip && <div className="pointer-events-none absolute z-30 text-[11px] px-2 py-1 rounded" style={{ left: tip.x + 10, top: tip.y + 10, background: "#0F1E3D", color: "#fff" }}>{tip.s}</div>}
    </div>
  )
}

function Bars({ rows, color, label }: { rows: { name: string; usd: number }[]; color: string; label: string }) {
  const max = Math.max(1, ...rows.map(r => r.usd))
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 pt-4 pb-10 h-full">
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      {rows.length ? (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.name} className="flex items-center gap-2">
              <span className="text-[11px] w-36 shrink-0 truncate text-right" style={{ color: "var(--text-secondary)" }}>{short(r.name, 26)}</span>
              <div className="flex-1 h-4 rounded relative" style={{ background: "var(--bg-elevated)" }}>
                <div className="h-full rounded" style={{ width: `${(r.usd / max) * 100}%`, background: color, opacity: 0.85 }} />
              </div>
              <span className="text-[10px] font-mono tabular-nums w-14 shrink-0 text-right" style={{ color: "var(--text-primary)" }}>{usd(r.usd)}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>No data for this selection.</p>}
    </div>
  )
}

// ── Funding over time (per-year columns, respects the country filter) ─────────
function YearChart({ byYear, scope }: { byYear: Agg["byYear"]; scope: string }) {
  const max = Math.max(1, ...byYear.map(y => y.usd))
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 pt-4 pb-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Funding over time</h3>
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{scope} · USD committed per year</span>
      </div>
      <div className="flex-1 grid grid-cols-4 gap-3 items-end mt-4" style={{ minHeight: 150 }}>
        {byYear.map(y => (
          <div key={y.year} className="flex flex-col items-center justify-end h-full">
            <span className="text-[11px] font-mono tabular-nums mb-1" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{y.usd ? usd(y.usd) : "—"}</span>
            <div className="w-full rounded-t" style={{ height: `${Math.max(y.usd ? 3 : 0, (y.usd / max) * 100)}%`, background: DONOR, opacity: 0.85, transition: "height .25s" }} title={`${y.year}: ${usd(y.usd)} · ${y.activities} activities`} />
            <span className="text-[11px] mt-1.5" style={{ color: "var(--text-secondary)" }}>{y.year}</span>
            <span className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>{y.activities} {y.activities === 1 ? "activity" : "activities"}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Filterable activity table (hiring-table style) ────────────────────────────
function ActivityTable({ rows }: { rows: FundingActivity[] }) {
  const [search, setSearch] = useState("")
  const [donor, setDonor] = useState("all")
  const [cat, setCat] = useState("all")
  const [source, setSource] = useState("all")
  const [year, setYear] = useState("all")
  const sel = "px-3 py-2 text-sm rounded-md focus:outline-none"
  const selStyle = { background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }
  const donors = useMemo(() => [...new Set(rows.map(r => r.donor))].sort(), [rows])
  const cats = useMemo(() => [...new Set(rows.map(r => r.ai_category).filter(Boolean))].sort() as string[], [rows])
  const sources = useMemo(() => [...new Set(rows.map(r => r.source))].sort(), [rows])
  const years = useMemo(() => [...new Set(rows.map(r => r.year).filter(Boolean))].sort((a, b) => (b as number) - (a as number)) as number[], [rows])
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(r =>
      (donor === "all" || r.donor === donor) &&
      (cat === "all" || r.ai_category === cat) &&
      (source === "all" || r.source === source) &&
      (year === "all" || String(r.year) === year) &&
      (!q || r.title.toLowerCase().includes(q) || r.donor.toLowerCase().includes(q) || r.recipient.toLowerCase().includes(q))
    )
  }, [rows, search, donor, cat, source, year])
  const exportCSV = () => {
    const head = ["Title", "Donor", "Recipient", "Category", "Source", "USD", "Year", "URL"]
    const csv = [head, ...filtered.map(r => [r.title, r.donor, r.recipient, r.ai_category ? (CAT_LABEL[r.ai_category] ?? r.ai_category) : "", r.source, String(r.usd), String(r.year ?? ""), r.url ?? ""])]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "ai-funding.csv"; a.click()
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input placeholder="Search activities, donors, recipients…" value={search} onChange={e => setSearch(e.target.value)} className={`flex-1 min-w-[220px] ${sel}`} style={selStyle} />
        <select value={donor} onChange={e => setDonor(e.target.value)} className={sel} style={selStyle}><option value="all">All donors</option>{donors.map(d => <option key={d} value={d}>{short(d, 32)}</option>)}</select>
        <select value={cat} onChange={e => setCat(e.target.value)} className={sel} style={selStyle}><option value="all">All categories</option>{cats.map(c => <option key={c} value={c}>{CAT_LABEL[c] ?? c}</option>)}</select>
        <select value={source} onChange={e => setSource(e.target.value)} className={sel} style={selStyle}><option value="all">All sources</option>{sources.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={year} onChange={e => setYear(e.target.value)} className={sel} style={selStyle}><option value="all">All years</option>{years.map(y => <option key={y} value={String(y)}>{y}</option>)}</select>
        <button onClick={exportCSV} className={sel} style={{ ...selStyle, color: "var(--text-secondary)" }}>Export CSV</button>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{filtered.length} of {rows.length} activities · {usd(filtered.reduce((s, r) => s + r.usd, 0))}</p>
      <div className="max-h-[460px] overflow-y-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead className="sticky top-0 z-10" style={{ background: "var(--bg-surface)" }}>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {["Activity", "Donor", "Recipient", "Category", "Src", "USD", "Yr"].map((h, i) => <th key={h} className="px-2.5 py-2 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)", textAlign: i >= 5 ? "right" : "left" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-2.5 py-1.5" style={{ color: "var(--text-primary)" }}>{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{short(r.title, 58)}</a> : short(r.title, 58)}</td>
                <td className="px-2.5 py-1.5" style={{ color: "var(--text-secondary)" }}>{short(r.donor, 22)}</td>
                <td className="px-2.5 py-1.5" style={{ color: "var(--text-secondary)" }}>{short(r.recipient, 18)}</td>
                <td className="px-2.5 py-1.5" style={{ color: "var(--text-tertiary)" }}>{r.ai_category ? (CAT_LABEL[r.ai_category] ?? r.ai_category) : "—"}</td>
                <td className="px-2.5 py-1.5 text-[10px]" style={{ color: "var(--text-tertiary)" }}>{r.source}</td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>{usd(r.usd)}</td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[11px]" style={{ color: "var(--text-tertiary)" }}>{r.year ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FundingFlowView({ data }: { data: FundingData }) {
  const [country, setCountry] = useState("All")
  const builtAt = new Date(data.built_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  // Recipient options for the filter (all countries + Global), ranked by $.
  const countryOpts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of data.activities) for (const al of a.allocations) m.set(al.name, (m.get(al.name) || 0) + al.usd)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, usdv]) => ({ name, usd: usdv }))
  }, [data.activities])

  const agg = useMemo(() => aggregate(data.activities, country), [data.activities, country])
  const t = agg

  return (
    <div className="space-y-4">
      {/* Title + POC + caveats */}
      <div>
        <div className="flex items-center gap-2">
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", color: "var(--text-primary)" }}>Funding Flow</h1>
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--accent-amber-bg)", color: "var(--accent-amber)" }}>POC</span>
        </div>
        <p className="text-[11px] mt-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Sourced from IATI, OECD CRS <br />Last updated {builtAt}
        </p>
        <div className="mt-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed" style={{ background: "var(--accent-amber-bg)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
          <b style={{ color: "var(--accent-amber)" }}>Early proof-of-concept — figures are an undercount.</b> Free-text search needs a (pending) IATI API key, so AI activities are currently discovered only within a few AI-likely sectors — real totals are higher.
          <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
            <li>Scoped to <b>2023–2026</b> — the LLM/AI inflection — by activity start year.</li>
            <li>Many activities are coded <b>global / multi-country</b> (no single recipient), so the map covers only country-coded aid.</li>
            <li>Amounts are converted EUR→USD (~1.08).</li>
          </ul>
        </div>
      </div>

      {/* Country filter — drives every visualization below */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Filter by recipient</span>
        <CountryCombo value={country} options={countryOpts} onChange={setCountry} />
        {country !== "All" && (
          <>
            <button onClick={() => setCountry("All")} className="text-[11px] rounded px-2 py-1" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>Clear ✕</button>
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Showing <b style={{ color: "var(--text-primary)" }}>{country}</b> only · {usd(agg.totalUsd)} across {agg.nActs} {agg.nActs === 1 ? "activity" : "activities"}</span>
          </>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[["Total AI aid", usd(t.totalUsd)], ["Activities", String(t.nActs)], ["Donors", String(t.nDonors)], ["Recipient countries", String(t.nRecips)], ["Years", t.yearMin ? `${t.yearMin}–${t.yearMax}` : "—"]].map(([l, v]) => (
          <div key={l} className="rounded-lg px-3 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
            <div className="font-mono tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>{v}</div>
            <div className="text-[9px] font-medium uppercase tracking-wider mt-0.5" style={{ color: "var(--text-tertiary)" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Sankey + map side by side (equal height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <DownloadableNode corner="br" filename="ai-funding-sankey.png" className="h-full">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 pt-4 pb-7 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Donor → recipient flows</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 mb-1">Blue = donors, green = recipients; band width = USD. Hover a band for the amount, or open fullscreen ⤢.</p>
            <div className="flex-1"><Sankey flows={agg.flows} /></div>
          </div>
        </DownloadableNode>
        <DownloadableNode corner="br" filename="ai-funding-recipients-map.png" className="h-full">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 pt-4 pb-7 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI aid by recipient country</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Shaded by USD received (country-coded only). Scroll to zoom, drag to pan, or open fullscreen ⤢.</p>
            <div className="flex-1"><RecipientMap byRecipient={agg.byRecipient} /></div>
          </div>
        </DownloadableNode>
      </div>

      {/* Funding over time (2023–2026), scoped to the current filter */}
      <DownloadableNode corner="tr" filename="ai-funding-over-time.png" className="block">
        <YearChart byYear={agg.byYear} scope={country === "All" ? "All recipients" : country} />
      </DownloadableNode>

      {/* Three equal, downloadable boxes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <DownloadableNode corner="br" filename="top-recipients.png" className="h-full"><Bars label="Top recipients" color={RECIP} rows={agg.byRecipient.slice(0, 8).map(r => ({ name: r.name, usd: r.usd }))} /></DownloadableNode>
        <DownloadableNode corner="br" filename="top-donors.png" className="h-full"><Bars label="Top donors" color={DONOR} rows={agg.byDonor.slice(0, 8).map(d => ({ name: d.donor, usd: d.usd }))} /></DownloadableNode>
        <DownloadableNode corner="br" filename="by-ai-category.png" className="h-full"><Bars label="By AI category" color="#C77F2E" rows={agg.bySector.map(s => ({ name: CAT_LABEL[s.code] ?? s.code, usd: s.usd }))} /></DownloadableNode>
      </div>

      {/* Filterable activity table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Activities</p>
        <ActivityTable rows={agg.rows} />
      </div>
    </div>
  )
}
