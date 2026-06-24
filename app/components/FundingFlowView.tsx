"use client"

import { useMemo, useState, useEffect, useRef, useReducer } from "react"
import { geoNaturalEarth1, geoPath } from "d3-geo"
import { select } from "d3-selection"
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom"
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, type Simulation } from "d3-force"
import { feature } from "topojson-client"
import type { Topology } from "topojson-specification"
import type { FeatureCollection, Geometry } from "geojson"
import countries110m from "world-atlas/countries-110m.json"
import type { FundingData } from "../types"
import { DownloadableNode } from "./ds/DownloadableNode"

const usd = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`
const DONOR = "#2C4D9E", RECIP = "#2D8F66"
const RAMP = ["#EAF3EE", "#BFE0CD", "#84C79E", "#4E9E74", "#226B49"]
const NO_DATA = "#EEF1F5"
const CAT_LABEL: Record<string, string> = {
  governance_policy: "Governance & policy", health_ai: "Health AI", education_skills: "Education & skills",
  capacity_building: "Capacity building", data_systems: "Data systems", research: "Research",
  infrastructure_compute: "Infrastructure / compute", agriculture_ai: "Agriculture AI",
  financial_inclusion: "Financial inclusion", other: "Other",
}
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

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

// ── Interactive force graph: donors ↔ recipients (drag nodes, pan/zoom) ───────
type GNode = { id: string; label: string; type: "donor" | "recipient"; val: number; r: number; x: number; y: number; fx?: number | null; fy?: number | null }
type GLink = { source: GNode | string; target: GNode | string; val: number }

function ForceGraph({ flows }: { flows: FundingData["flows"] }) {
  const W = 820, H = 460, TOPD = 8, TOPR = 14
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<Simulation<GNode, undefined> | null>(null)
  const ztRef = useRef<ZoomTransform>(zoomIdentity)
  const [zt, setZt] = useState<ZoomTransform>(zoomIdentity)
  const [, rerender] = useReducer((x) => x + 1, 0)
  const [hov, setHov] = useState<string | null>(null)
  const [fs, setFs] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; s: string } | null>(null)
  const drag = useRef<GNode | null>(null)

  const { nodes, links } = useMemo(() => {
    const dT = new Map<string, number>(), rT = new Map<string, number>()
    for (const f of flows) { dT.set(f.donor, (dT.get(f.donor) || 0) + f.usd); rT.set(f.recipient, (rT.get(f.recipient) || 0) + f.usd) }
    const top = (m: Map<string, number>, n: number) => new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]))
    const dTop = top(dT, TOPD), rTop = top(rT, TOPR)
    const dn = (d: string) => dTop.has(d) ? d : "Other donors"
    const rn = (r: string) => rTop.has(r) ? r : "Other recipients"
    const lk = new Map<string, number>(), nv = new Map<string, ["donor" | "recipient", number]>()
    for (const f of flows) {
      const d = dn(f.donor), r = rn(f.recipient)
      lk.set(`D:${d}|R:${r}`, (lk.get(`D:${d}|R:${r}`) || 0) + f.usd)
      nv.set(`D:${d}`, ["donor", (nv.get(`D:${d}`)?.[1] || 0) + f.usd])
      nv.set(`R:${r}`, ["recipient", (nv.get(`R:${r}`)?.[1] || 0) + f.usd])
    }
    const maxV = Math.max(1, ...[...nv.values()].map(v => v[1]))
    const nodes: GNode[] = [...nv.entries()].map(([id, [type, val]], i) => ({
      id, label: id.slice(2), type, val, r: 5 + 18 * Math.sqrt(val / maxV),
      x: (type === "donor" ? W * 0.28 : W * 0.72) + (i % 5) * 6, y: H / 2 + (i % 7 - 3) * 20,
    }))
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
    const links: GLink[] = [...lk.entries()].map(([k, val]) => { const [s, t] = k.split("|"); return { source: byId[s], target: byId[t], val } }).filter(l => l.source && l.target)
    return { nodes, links }
  }, [flows])

  useEffect(() => {
    const maxL = Math.max(1, ...links.map(l => l.val))
    const sim = forceSimulation<GNode>(nodes)
      .force("link", forceLink<GNode, GLink>(links).id(d => d.id).distance(80).strength(l => 0.1 + 0.5 * (l.val / maxL)))
      .force("charge", forceManyBody().strength(-180))
      .force("x", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide<GNode>().radius(d => d.r + 4))
      .on("tick", rerender)
    simRef.current = sim
    return () => { sim.stop() }
  }, [nodes, links])

  // Pan / zoom on the background; node drags are excluded via the filter.
  useEffect(() => {
    if (!svgRef.current) return
    const sel = select(svgRef.current as Element)
    const z = d3zoom<Element, unknown>().scaleExtent([0.4, 6])
      .filter((e: Event) => e.type === "wheel" || !((e.target as Element)?.closest?.("[data-node]")))
      .on("zoom", (e) => { ztRef.current = e.transform; setZt(e.transform) })
    sel.call(z as never); return () => { sel.on(".zoom", null) }
  }, [])

  const toGraph = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H
    const z = ztRef.current
    return { x: (sx - z.x) / z.k, y: (sy - z.y) / z.k }
  }
  const onDown = (n: GNode) => (e: React.PointerEvent) => { e.stopPropagation(); drag.current = n; const p = toGraph(e); n.fx = p.x; n.fy = p.y; simRef.current?.alphaTarget(0.3).restart(); (e.target as Element).setPointerCapture(e.pointerId) }
  const onMove = (e: React.PointerEvent) => { if (!drag.current) return; const p = toGraph(e); drag.current.fx = p.x; drag.current.fy = p.y }
  const onUp = () => { if (drag.current) { drag.current.fx = null; drag.current.fy = null; drag.current = null; simRef.current?.alphaTarget(0) } }
  const edgeTip = (l: GLink) => (e: React.MouseEvent) => { const r = wrapRef.current!.getBoundingClientRect(); const s = l.source as GNode, t = l.target as GNode; setTip({ x: e.clientX - r.left, y: e.clientY - r.top, s: `${s.label} → ${t.label}: ${usd(l.val)}` }) }

  const ns = nodes, ls = links
  const maxL = Math.max(1, ...ls.map(l => l.val))
  const svg = (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      style={{ touchAction: "none", cursor: "grab", height: fs ? "calc(100vh - 90px)" : undefined, display: "block" }}
      onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { onUp(); }}>
      <g transform={`translate(${zt.x},${zt.y}) scale(${zt.k})`}>
        {ls.map((l, i) => {
          const s = l.source as GNode, t = l.target as GNode
          const active = hov === null || hov === s.id || hov === t.id
          return (
            <g key={i}>
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={DONOR} strokeOpacity={active ? 0.2 : 0.04} strokeWidth={Math.max(0.6, 5 * (l.val / maxL))} />
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth={10} style={{ cursor: "pointer" }}
                onMouseMove={edgeTip(l)} onMouseLeave={() => setTip(null)} />
            </g>
          )
        })}
        {ns.map((n) => (
          <g key={n.id} data-node transform={`translate(${n.x},${n.y})`} onPointerDown={onDown(n)} onMouseEnter={() => setHov(n.id)} onMouseLeave={() => setHov(null)} style={{ cursor: "grab" }}>
            <circle r={n.r} fill={n.type === "donor" ? DONOR : RECIP} fillOpacity={hov === null || hov === n.id ? 0.9 : 0.35} stroke="#fff" strokeWidth={1.2} />
            {(n.r > 10 || hov === n.id) && <text y={n.r + 9} textAnchor="middle" fontSize={8.5} fill="#4A5878" fontFamily="ui-sans-serif, system-ui">{short(n.label, 20)}</text>}
            <title>{`${n.label} · ${usd(n.val)}`}</title>
          </g>
        ))}
      </g>
    </svg>
  )
  return (
    <div ref={wrapRef} className={fs ? "fixed inset-0 z-[60] p-4 flex flex-col" : "relative"} style={fs ? { background: "var(--bg-base)" } : undefined}>
      {fs && <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Donor ↔ recipient network</span></div>}
      <FsBtn fs={fs} onClick={() => setFs(v => !v)} />
      {svg}
      {tip && <div className="pointer-events-none absolute z-30 text-[11px] px-2 py-1 rounded" style={{ left: tip.x + 12, top: tip.y + 12, background: "#0F1E3D", color: "#fff" }}>{tip.s}</div>}
    </div>
  )
}

// ── Recipient choropleth (same flat d3-geo setup as the Compute map) ──────────
function RecipientMap({ byRecipient }: { byRecipient: FundingData["by_recipient"] }) {
  const W = 820, H = 460
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [t, setT] = useState<ZoomTransform>(zoomIdentity)
  const [fs, setFs] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number; s: string } | null>(null)
  const valByName = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of byRecipient) if (r.name !== "Global / multi-country") m.set(r.name, r.usd)
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
    </div>
  )
}

// ── Filterable activity table (hiring-table style) ────────────────────────────
function ActivityTable({ rows }: { rows: FundingData["activities"] }) {
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
  const t = data.totals
  const builtAt = new Date(data.built_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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
            <li>Many activities are coded <b>global / multi-country</b> (no single recipient), so the map covers only country-coded aid.</li>
            <li>Amounts are converted EUR→USD (~1.08).</li>
          </ul>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[["Total AI aid", usd(t.usd)], ["Activities", String(t.activities)], ["Donors", String(t.donors)], ["Recipient countries", String(t.recipients)], ["Years", t.year_min ? `${t.year_min}–${t.year_max}` : "—"]].map(([l, v]) => (
          <div key={l} className="rounded-lg px-3 py-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
            <div className="font-mono tabular-nums" style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>{v}</div>
            <div className="text-[9px] font-medium uppercase tracking-wider mt-0.5" style={{ color: "var(--text-tertiary)" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Force graph + map side by side (equal height) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <DownloadableNode corner="br" filename="ai-funding-network.png" className="h-full">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 pt-4 pb-7 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Donor ↔ recipient network</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 mb-1">Blue = donors, green = recipients; node size & link width = USD. Drag nodes, scroll to zoom/pan, hover an edge for the amount, or open fullscreen ⤢.</p>
            <div className="flex-1"><ForceGraph flows={data.flows} /></div>
          </div>
        </DownloadableNode>
        <DownloadableNode corner="br" filename="ai-funding-recipients-map.png" className="h-full">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 pt-4 pb-7 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI aid by recipient country</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Shaded by USD received (country-coded only). Scroll to zoom, drag to pan, or open fullscreen ⤢.</p>
            <div className="flex-1"><RecipientMap byRecipient={data.by_recipient} /></div>
          </div>
        </DownloadableNode>
      </div>

      {/* Three equal, downloadable boxes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <DownloadableNode corner="br" filename="top-recipients.png" className="h-full"><Bars label="Top recipients" color={RECIP} rows={data.by_recipient.slice(0, 8).map(r => ({ name: r.name, usd: r.usd }))} /></DownloadableNode>
        <DownloadableNode corner="br" filename="top-donors.png" className="h-full"><Bars label="Top donors" color={DONOR} rows={data.by_donor.slice(0, 8).map(d => ({ name: d.donor, usd: d.usd }))} /></DownloadableNode>
        <DownloadableNode corner="br" filename="by-ai-category.png" className="h-full"><Bars label="By AI category" color="#C77F2E" rows={data.by_sector.map(s => ({ name: CAT_LABEL[s.code] ?? s.code, usd: s.usd }))} /></DownloadableNode>
      </div>

      {/* Filterable activity table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Activities</p>
        <ActivityTable rows={data.activities} />
      </div>
    </div>
  )
}
