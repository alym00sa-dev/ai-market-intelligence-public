"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import type { FeatureCollection } from "geojson"
import type { ReadinessMetric, MapMode } from "./ComputeConnectivityView"

// CARTO Positron — light vector base, no API key. Clean backdrop for the choropleth.
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

// AfTerFibre terrestrial-fibre vector tiles (live / go_live → lit/dark/planned).
const AFRICA_FIBRE_TILEJSON = "https://d316kar6yg8hyq.cloudfront.net/africa-fiber.json"
const AFRICA_FIBRE_LAYER    = "fiber"
const CURRENT_YEAR          = new Date().getFullYear()

const FIBRE_COLOR = "#E8A317"   // amber — legible on the light base
const CABLE_COLOR = "#179C8E"   // teal

// Africa-only view.  [[west, south], [east, north]]
const FOCUS_BOUNDS: maplibregl.LngLatBoundsLike = [[-20, -36], [55, 40]]

// Readiness choropleth ramp (light → deep green). Mirrors the legend in the view.
const RAMP = ["#EDF3F0", "#BBDFC8", "#84C79E", "#4E9E74", "#226B49"]
const NO_DATA = "#E3E6EA"

const FIBER_LAYERS = [
  "cables-line", "cables-hit", "landing-circle",
  "fibre-lit-line", "fibre-dark-line", "fibre-planned-line",
  "dc-active-circle", "dc-construction-circle", "dc-planned-circle",
]
const READINESS_LAYERS = ["readiness-fill", "readiness-line"]

// Data-driven fill expression for the selected metric. null/absent → grey.
function fillColorExpr(metric: ReadinessMetric): maplibregl.ExpressionSpecification {
  const ramp = metric.goodHigh ? RAMP : [...RAMP].reverse()
  const span = metric.max - metric.min || 1
  const sentinel = metric.min - span - 1
  const stops = ramp.flatMap((c, i) => [metric.min + span * (i / (ramp.length - 1)), c])
  return [
    "interpolate", ["linear"],
    ["coalesce", ["to-number", ["get", metric.key]], sentinel],
    sentinel, NO_DATA,
    ...stops,
  ] as unknown as maplibregl.ExpressionSpecification
}

function applyMode(map: maplibregl.Map, mode: MapMode) {
  for (const id of FIBER_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", mode === "fiber" ? "visible" : "none")
  for (const id of READINESS_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", mode === "readiness" ? "visible" : "none")
}

function applyMetric(map: maplibregl.Map, metric: ReadinessMetric | undefined) {
  if (!metric || !map.getLayer("readiness-fill")) return
  map.setPaintProperty("readiness-fill", "fill-color", fillColorExpr(metric))
}

const num = (v: unknown, dec = 1) => (typeof v === "number" && !Number.isNaN(v) ? v.toFixed(dec) : "—")

export default function ComputeMap({
  mode, metricKey, metrics, readinessGeo,
}: {
  mode: MapMode
  metricKey: string
  metrics: ReadinessMetric[]
  readinessGeo: FeatureCollection
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const loadedRef    = useRef(false)
  const modeRef      = useRef(mode)
  const metricRef    = useRef(metricKey)
  modeRef.current = mode
  metricRef.current = metricKey

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: FOCUS_BOUNDS,
      fitBoundsOptions: { padding: 30 },
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right")

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "compute-map-popup" })

    map.on("load", async () => {
      // ── Readiness choropleth (added first so fibre/cables render on top) ──
      map.addSource("readiness", { type: "geojson", data: readinessGeo })
      const firstSymbol = (map.getStyle().layers ?? []).find((l) => l.type === "symbol")?.id
      map.addLayer({
        id: "readiness-fill", type: "fill", source: "readiness",
        paint: { "fill-color": fillColorExpr(metrics[0]), "fill-opacity": 0.82 },
        layout: { visibility: "none" },
      }, firstSymbol)
      map.addLayer({
        id: "readiness-line", type: "line", source: "readiness",
        paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.9 },
        layout: { visibility: "none" },
      }, firstSymbol)

      // ── Country hover (readiness) ──
      map.on("mousemove", "readiness-fill", (e) => {
        if (!e.features?.length) { return }
        const p = e.features[0].properties ?? {}
        map.getCanvas().style.cursor = "pointer"
        if (!(p.hasData === true || p.hasData === "true")) {
          popup.setLngLat(e.lngLat).setHTML(`<div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;"><span style="font-weight:600;color:#fff;font-size:12px;">${p.name ?? "—"}</span><div style="opacity:.6;margin-top:2px;">No readiness data</div></div>`).addTo(map)
          return
        }
        const row = (label: string, v: unknown, unit = "%") => `<div style="display:flex;justify-content:space-between;gap:14px;"><span style="opacity:.65;">${label}</span><span style="font-weight:600;color:#fff;">${num(v)}${v == null || v === "" ? "" : unit}</span></div>`
        popup.setLngLat(e.lngLat).setHTML(`
          <div style="font:11px/1.5 system-ui,sans-serif;color:#E5EAF1;min-width:180px;">
            <div style="font-weight:600;color:#fff;font-size:12px;margin-bottom:5px;">${p.name}</div>
            ${row("Internet use", p.internet_3mo)}
            ${row("Smartphone", p.smartphone)}
            ${row("Mobile ownership", p.mobile_own)}
            ${row("Digital payments", p.digital_payment)}
            ${row("Adult literacy", p.literacy)}
            ${row("Internet gender gap", p.gender_gap, " pts")}
            ${row("GovTech Maturity", p.gtmi, "")}
            <div style="opacity:.4;font-size:9px;margin-top:5px;">Findex 2024 · GSMA · WB GovTech 2025</div>
          </div>`).addTo(map)
      })
      map.on("mouseleave", "readiness-fill", () => { map.getCanvas().style.cursor = ""; popup.remove() })

      // ── Fibre + cable + landing + data-center layers ──
      try {
        const [cablesRes, landingRes, dcsRes] = await Promise.all([
          fetch("/data/compute-connectivity/cables.geojson"),
          fetch("/data/compute-connectivity/landing-points.geojson"),
          fetch("/data/compute-connectivity/data-centers.geojson"),
        ])
        map.addSource("cables", { type: "geojson", data: await cablesRes.json() })
        map.addSource("landing", { type: "geojson", data: await landingRes.json() })
        map.addSource("data-centers", { type: "geojson", data: await dcsRes.json() })
        map.addSource("africa-fibre", { type: "vector", url: AFRICA_FIBRE_TILEJSON, attribution: "Fibre: AfTerFibre / NSRC (CC-BY-4.0)" })

        map.addLayer({
          id: "fibre-dark-line", type: "line", source: "africa-fibre", "source-layer": AFRICA_FIBRE_LAYER,
          filter: ["all", ["==", ["get", "live"], false], ["any", ["==", ["get", "go_live"], 0], ["==", ["get", "go_live"], null], ["<", ["get", "go_live"], CURRENT_YEAR]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": FIBRE_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 6, 1.0, 10, 1.6], "line-opacity": 0.4 },
        })
        map.addLayer({
          id: "fibre-planned-line", type: "line", source: "africa-fibre", "source-layer": AFRICA_FIBRE_LAYER,
          filter: ["all", ["==", ["get", "live"], false], [">=", ["get", "go_live"], CURRENT_YEAR]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": FIBRE_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.2, 10, 1.8], "line-opacity": 0.85, "line-dasharray": [3, 2] },
        })
        map.addLayer({
          id: "fibre-lit-line", type: "line", source: "africa-fibre", "source-layer": AFRICA_FIBRE_LAYER,
          filter: ["==", ["get", "live"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": FIBRE_COLOR, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.2, 10, 1.8], "line-opacity": 0.85 },
        })
        map.addLayer({
          id: "cables-line", type: "line", source: "cables",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["coalesce", ["get", "color"], CABLE_COLOR], "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 4, 1.2, 8, 2.2], "line-opacity": 0.8 },
        })
        map.addLayer({ id: "cables-hit", type: "line", source: "cables", paint: { "line-color": "#000", "line-width": 12, "line-opacity": 0 } })
        map.addLayer({
          id: "landing-circle", type: "circle", source: "landing",
          paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2, 6, 4, 10, 6], "circle-color": "#EF4444", "circle-stroke-width": 1.2, "circle-stroke-color": "rgba(255,255,255,0.9)", "circle-opacity": 0.92 },
        })

        const dcRadius = ["interpolate", ["linear"], ["get", "power_mw"], 0, 4, 100, 5, 500, 7, 1000, 9, 2000, 12] as unknown as maplibregl.ExpressionSpecification
        map.addLayer({ id: "dc-active-circle", type: "circle", source: "data-centers", filter: ["==", ["get", "status"], "active"], paint: { "circle-radius": dcRadius, "circle-color": "#0FB5A6", "circle-stroke-width": 1.2, "circle-stroke-color": "rgba(255,255,255,0.95)", "circle-opacity": 0.95 } })
        map.addLayer({ id: "dc-construction-circle", type: "circle", source: "data-centers", filter: ["==", ["get", "status"], "under_construction"], paint: { "circle-radius": dcRadius, "circle-color": "#E0A800", "circle-stroke-width": 1.2, "circle-stroke-color": "rgba(255,255,255,0.95)", "circle-opacity": 0.92 } })
        map.addLayer({ id: "dc-planned-circle", type: "circle", source: "data-centers", filter: ["==", ["get", "status"], "planned"], paint: { "circle-radius": dcRadius, "circle-color": "transparent", "circle-stroke-width": 1.5, "circle-stroke-color": "#FB923C", "circle-opacity": 0.95 } })

        // ── Cable hover ──
        map.on("mousemove", "cables-hit", (e) => {
          map.getCanvas().style.cursor = "pointer"
          if (!e.features?.length) return
          const p = e.features[0].properties ?? {}
          const owners = typeof p.owners === "string" && p.owners.length > 80 ? p.owners.slice(0, 78) + "…" : p.owners
          const planned = p.is_planned === true || p.is_planned === "true" ? '<span style="color:#E0A800;font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Planned</span>' : ""
          popup.setLngLat(e.lngLat).setHTML(`
            <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="display:inline-block;width:10px;height:2px;background:${p.color ?? CABLE_COLOR};border-radius:2px;"></span>
                <span style="font-weight:600;color:#fff;font-size:12px;">${p.name ?? "Cable"}</span>${planned}
              </div>
              <div style="opacity:.65;">RFS ${p.rfs ?? p.rfs_year ?? "n/a"}${p.length ? ` · ${p.length}` : ""}</div>
              ${owners ? `<div style="opacity:.55;margin-top:3px;">${owners}</div>` : ""}
            </div>`).addTo(map)
        })
        map.on("mouseleave", "cables-hit", () => { map.getCanvas().style.cursor = ""; popup.remove() })

        // ── Fibre hover ──
        for (const id of ["fibre-lit-line", "fibre-dark-line", "fibre-planned-line"]) {
          map.on("mousemove", id, (e) => {
            map.getCanvas().style.cursor = "pointer"
            if (!e.features?.length) return
            const p = e.features[0].properties ?? {}
            const isLit = p.live === true || p.live === "true"
            const goLive = typeof p.go_live === "number" ? p.go_live : Number(p.go_live)
            const status = isLit ? "Lit" : goLive && goLive >= CURRENT_YEAR ? `Planned · go-live ${goLive}` : "Dark fibre (latent)"
            popup.setLngLat(e.lngLat).setHTML(`
              <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
                <div style="font-weight:600;color:#fff;font-size:12px;margin-bottom:3px;">${p.operator_name ?? p.operator ?? "Fibre route"}</div>
                <div style="opacity:.7;">${status}</div>${p.country ? `<div style="opacity:.55;">${p.country}</div>` : ""}
                <div style="opacity:.4;font-size:9px;margin-top:4px;">Source: AfTerFibre / NSRC</div>
              </div>`).addTo(map)
          })
          map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; popup.remove() })
        }

        // ── Landing-point hover ──
        map.on("mousemove", "landing-circle", (e) => {
          map.getCanvas().style.cursor = "pointer"
          if (!e.features?.length) return
          const p = e.features[0].properties ?? {}
          popup.setLngLat(e.lngLat).setHTML(`<div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;"><span style="font-weight:600;color:#fff;font-size:12px;">${p.name ?? "Landing point"}</span><div style="opacity:.65;">${p.country ?? ""}</div></div>`).addTo(map)
        })
        map.on("mouseleave", "landing-circle", () => { map.getCanvas().style.cursor = ""; popup.remove() })

        // ── Data-center hover ──
        for (const id of ["dc-active-circle", "dc-construction-circle", "dc-planned-circle"]) {
          map.on("mousemove", id, (e) => {
            map.getCanvas().style.cursor = "pointer"
            if (!e.features?.length) return
            const p = e.features[0].properties ?? {}
            const label = p.status === "active" ? "Active" : p.status === "under_construction" ? "Under construction" : "Planned"
            const color = p.status === "active" ? "#0FB5A6" : p.status === "under_construction" ? "#E0A800" : "#FB923C"
            const mw = Number(p.power_mw) || 0
            popup.setLngLat(e.lngLat).setHTML(`
              <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
                <div style="font-weight:600;color:#fff;font-size:12px;margin-bottom:2px;">${p.name ?? "Data center"}</div>
                <div style="opacity:.65;margin-bottom:2px;">${p.owner ?? ""}</div>
                <div style="font-size:10px;"><span style="color:${color};text-transform:uppercase;letter-spacing:.05em;font-weight:600;">${label}</span>${p.country ? ` · ${p.country}` : ""}</div>
                ${mw > 0 ? `<div style="opacity:.7;font-size:10px;margin-top:3px;"><strong style="color:#fff;">${mw >= 1000 ? (mw / 1000).toFixed(1) + " GW" : Math.round(mw) + " MW"}</strong> power</div>` : ""}
              </div>`).addTo(map)
          })
          map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; popup.remove() })
        }
      } catch (err) {
        console.warn("[ComputeMap] failed to load fibre/cable layers:", err)
      }

      loadedRef.current = true
      applyMode(map, modeRef.current)
      applyMetric(map, metrics.find((m) => m.key === metricRef.current))
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; loadedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to mode / metric changes after load.
  useEffect(() => { if (loadedRef.current && mapRef.current) applyMode(mapRef.current, mode) }, [mode])
  useEffect(() => { if (loadedRef.current && mapRef.current) applyMetric(mapRef.current, metrics.find((m) => m.key === metricKey)) }, [metricKey, metrics])

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: "calc(100vh - 200px)", minHeight: 520, background: "#F7FAFC" }}
    />
  )
}
