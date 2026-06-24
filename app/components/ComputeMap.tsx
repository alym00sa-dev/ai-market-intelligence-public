"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { geoMercator, geoPath } from "d3-geo"
import { select } from "d3-selection"
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import type { ReadinessMetric, MapMode } from "./ComputeConnectivityView"

// Flat vector map (no tiles) — country shapes from world-atlas (passed in via
// readinessGeo), facility markers + cable/fibre lines drawn as SVG on top.

const W = 960, H = 660, PAD = 12
const RAMP = ["#EDF3F0", "#BBDFC8", "#84C79E", "#4E9E74", "#226B49"]
const NO_DATA = "#E6EAEF"      // countries with no value / out of scope
const LAND_NEUTRAL = "#F1ECE3" // in fiber mode, land is a soft neutral
const CABLE_COLOR = "#179C8E"
const FIBRE_COLOR = "#E8A317"

type Props = Record<string, number | string | boolean | null>
type GeoFC = FeatureCollection<Geometry, Props>

function colorFor(v: unknown, metric: ReadinessMetric | undefined): string {
  if (!metric || typeof v !== "number" || Number.isNaN(v)) return NO_DATA
  const ramp = metric.goodHigh ? RAMP : [...RAMP].reverse()
  const span = metric.max - metric.min || 1
  const tt = Math.max(0, Math.min(0.999, (v - metric.min) / span))
  return ramp[Math.floor(tt * ramp.length)]
}

const fnum = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v.toFixed(1) : "—")

type Tip = { x: number; y: number; node: React.ReactNode } | null

function Row({ l, v, u = "%" }: { l: string; v: unknown; u?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
      <span style={{ opacity: 0.65 }}>{l}</span>
      <span style={{ fontWeight: 600, color: "#fff" }}>{fnum(v)}{v == null || v === "" ? "" : u}</span>
    </div>
  )
}

export default function ComputeMap({
  mode, metricKey, metrics, readinessGeo,
}: {
  mode: MapMode
  metricKey: string
  metrics: ReadinessMetric[]
  readinessGeo: FeatureCollection
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef  = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<Element, unknown> | null>(null)
  const [t, setT] = useState<ZoomTransform>(zoomIdentity)
  const [tip, setTip] = useState<Tip>(null)
  const [layers, setLayers] = useState<{ cables?: GeoFC; landing?: GeoFC; dcs?: GeoFC; fibre?: GeoFC; corridors?: GeoFC }>({})

  const metric = metrics.find((m) => m.key === metricKey)
  const geo = readinessGeo as GeoFC

  // Projection fit to the in-scope (data) countries → frames Africa + India + Pakistan.
  const { path, project } = useMemo(() => {
    const focus = geo.features.filter((f) => f.properties?.hasData === true)
    const proj = geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]],
      { type: "FeatureCollection", features: focus.length ? focus : geo.features })
    return { path: geoPath(proj), project: proj }
  }, [geo])

  // Precompute path strings / points so hover + zoom re-renders don't re-run geometry.
  const countries = useMemo(() => geo.features.map((f) => ({ d: path(f as Feature<Geometry, Props>) || "", p: f.properties })), [geo, path])
  const fibre     = useMemo(() => (layers.fibre?.features ?? []).map((f) => ({ d: path(f as Feature<Geometry, Props>) || "", p: f.properties })), [layers.fibre, path])
  const corridors = useMemo(() => (layers.corridors?.features ?? []).map((f) => path(f as Feature<Geometry, Props>) || ""), [layers.corridors, path])
  const cables    = useMemo(() => (layers.cables?.features ?? []).map((f) => ({ d: path(f as Feature<Geometry, Props>) || "", p: f.properties })), [layers.cables, path])
  const landing   = useMemo(() => (layers.landing?.features ?? []).map((f) => ({ xy: project(((f.geometry as { coordinates?: [number, number] }).coordinates) ?? [0, 0]), p: f.properties })), [layers.landing, project])
  const dcs       = useMemo(() => (layers.dcs?.features ?? []).map((f) => ({ xy: project(((f.geometry as { coordinates?: [number, number] }).coordinates) ?? [0, 0]), p: f.properties })), [layers.dcs, project])

  // Load overlay layers (client-side).
  useEffect(() => {
    let alive = true
    const get = async (u: string) => { try { return await (await fetch(u)).json() } catch { return null } }
    ;(async () => {
      const b = "/data/compute-connectivity/"
      const [c, l, d, fb, cr] = await Promise.all([
        get(b + "cables.geojson"), get(b + "landing-points.geojson"), get(b + "data-centers.geojson"),
        get(b + "africa-fibre.geojson"), get(b + "approx-corridors.geojson"),
      ])
      if (alive) setLayers({ cables: c, landing: l, dcs: d, fibre: fb, corridors: cr })
    })()
    return () => { alive = false }
  }, [])

  // Pan / zoom.
  useEffect(() => {
    if (!svgRef.current) return
    const sel = select(svgRef.current as Element)
    const z = d3zoom<Element, unknown>().scaleExtent([1, 9]).on("zoom", (e) => setT(e.transform))
    zoomRef.current = z
    sel.call(z)
    return () => { sel.on(".zoom", null) }
  }, [])

  const move = (e: React.MouseEvent, node: React.ReactNode) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, node })
  }
  const leave = () => setTip(null)
  const reset = () => {
    if (svgRef.current && zoomRef.current) select(svgRef.current as Element).transition().duration(250).call(zoomRef.current.transform, zoomIdentity)
  }

  return (
    <div ref={wrapRef} className="relative w-full" style={{ background: "#FBFCFE" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "calc(100vh - 200px)", minHeight: 520, cursor: "grab" }}>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {/* Countries */}
          {countries.map((c, i) => {
            if (!c.d) return null
            const hasData = c.p?.hasData === true
            const fill = mode === "readiness" ? colorFor(c.p?.[metricKey], metric) : (hasData ? LAND_NEUTRAL : NO_DATA)
            const interactive = mode === "readiness"
            return (
              <path key={i} d={c.d} fill={fill} stroke="#FBFCFE" strokeWidth={0.5} vectorEffect="non-scaling-stroke"
                style={{ cursor: interactive && hasData ? "pointer" : "default" }}
                onMouseMove={interactive ? (e) => move(e, (
                  <>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: 12, marginBottom: 4 }}>{String(c.p?.name ?? "—")}</div>
                    {hasData ? (
                      <>
                        <Row l="Internet use" v={c.p?.internet_3mo} />
                        <Row l="Daily internet" v={c.p?.daily_internet} />
                        <Row l="Smartphone" v={c.p?.smartphone} />
                        <Row l="Mobile ownership" v={c.p?.mobile_own} />
                        <Row l="Social media" v={c.p?.social_media} />
                        <Row l="WhatsApp" v={c.p?.whatsapp} />
                        <Row l="Digital payments" v={c.p?.digital_payment} />
                        <Row l="Internet gender gap" v={c.p?.gender_gap} u=" pts" />
                        <Row l="Household electricity" v={c.p?.dhs_electricity} />
                        <Row l="Household computer" v={c.p?.dhs_computer} />
                        <Row l="GovTech Maturity" v={c.p?.gtmi} u="" />
                      </>
                    ) : <div style={{ opacity: 0.6 }}>No readiness data</div>}
                  </>
                )) : undefined}
                onMouseLeave={interactive ? leave : undefined} />
            )
          })}

          {/* Fiber-mode overlays */}
          {mode === "fiber" && <>
            {fibre.map((f, i) => f.d ? <path key={`fb${i}`} d={f.d} fill="none" stroke={FIBRE_COLOR} strokeWidth={1} strokeOpacity={0.65} vectorEffect="non-scaling-stroke"
              onMouseMove={(e) => move(e, <div style={{ color: "#fff" }}><b>{String(f.p?.operator ?? "Fibre")}</b><div style={{ opacity: .65 }}>{String(f.p?.country ?? "")} · terrestrial fibre</div><div style={{ opacity: .4, fontSize: 9, marginTop: 3 }}>AfTerFibre / NSRC</div></div>)} onMouseLeave={leave} /> : null)}
            {corridors.map((d, i) => d ? <path key={`cr${i}`} d={d} fill="none" stroke={FIBRE_COLOR} strokeWidth={1} strokeOpacity={0.55} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" /> : null)}
            {cables.map((f, i) => f.d ? <path key={`cb${i}`} d={f.d} fill="none" stroke={(f.p?.color as string) || CABLE_COLOR} strokeWidth={1} strokeOpacity={0.8} vectorEffect="non-scaling-stroke"
              onMouseMove={(e) => move(e, <div style={{ color: "#fff" }}><b>{String(f.p?.name ?? "Cable")}</b><div style={{ opacity: .65 }}>RFS {String(f.p?.rfs ?? f.p?.rfs_year ?? "n/a")}</div></div>)} onMouseLeave={leave} /> : null)}
            {landing.map((m, i) => m.xy ? <circle key={`lp${i}`} cx={m.xy[0]} cy={m.xy[1]} r={2.4} fill="#EF4444" stroke="#fff" strokeWidth={0.6} vectorEffect="non-scaling-stroke"
              onMouseMove={(e) => move(e, <div style={{ color: "#fff" }}><b>{String(m.p?.name ?? "Landing point")}</b><div style={{ opacity: .65 }}>{String(m.p?.country ?? "")}</div></div>)} onMouseLeave={leave} /> : null)}
            {dcs.map((m, i) => {
              if (!m.xy) return null
              const st = String(m.p?.status ?? "")
              // Distinct purple so DCs pop above the teal cables / amber fibre.
              const solid = st === "active" ? "#7C3AED" : st === "under_construction" ? "#A855F7" : null
              const mw = Number(m.p?.power_mw) || 0
              const r = 6 + Math.min(9, Math.sqrt(mw) / 5)
              const tip = (e: React.MouseEvent) => move(e, <div style={{ color: "#fff" }}><b>{String(m.p?.name ?? "Data center")}</b><div style={{ opacity: .65 }}>{String(m.p?.owner ?? "")}</div><div style={{ fontSize: 10, marginTop: 2 }}>{st.replace(/_/g, " ")}{mw > 0 ? ` · ${mw >= 1000 ? (mw / 1000).toFixed(1) + " GW" : Math.round(mw) + " MW"}` : ""}</div></div>)
              return (
                <g key={`dc${i}`} onMouseMove={tip} onMouseLeave={leave} style={{ cursor: "pointer" }}>
                  <circle cx={m.xy[0]} cy={m.xy[1]} r={r + 2.5} fill="#fff" fillOpacity={0.95} vectorEffect="non-scaling-stroke" />
                  {solid
                    ? <circle cx={m.xy[0]} cy={m.xy[1]} r={r} fill={solid} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                    : <circle cx={m.xy[0]} cy={m.xy[1]} r={r} fill="#7C3AED" fillOpacity={0.18} stroke="#7C3AED" strokeWidth={2.2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
                </g>
              )
            })}
          </>}
        </g>
      </svg>

      {(t.k !== 1 || t.x !== 0 || t.y !== 0) && (
        <button onClick={reset} className="absolute top-3 right-3 text-[11px] rounded-md px-2 py-1"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>Reset</button>
      )}

      {tip && (
        <div className="pointer-events-none absolute z-20" style={{ left: tip.x + 12, top: tip.y + 12, maxWidth: 230, background: "#0F1E3D", color: "#E5EAF1", borderRadius: 6, padding: "7px 9px", font: "11px/1.5 system-ui, sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          {tip.node}
        </div>
      )}
    </div>
  )
}
