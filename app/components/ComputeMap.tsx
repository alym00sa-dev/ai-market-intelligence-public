"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

// CARTO Dark Matter — navy-dark vector style, no API key required, same tile
// pipeline AfTerFibre uses. Matches the spec's "navy-dark base map" requirement.
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

// AfTerFibre vector tile source. Same TileJSON manifest the official AfTerFibre
// map uses (CloudFront-backed). Schema includes `live` (bool) and `go_live` (year)
// which drive our lit/dark/planned 3-state encoding per the design spec.
const AFRICA_FIBRE_TILEJSON = "https://d316kar6yg8hyq.cloudfront.net/africa-fiber.json"
const AFRICA_FIBRE_LAYER    = "fiber"        // source-layer name from the TileJSON
const CURRENT_YEAR          = new Date().getFullYear()

// Combined bbox covering Africa + South Asia (India, Pakistan, Bangladesh, Sri Lanka).
// Format MapLibre expects: [[west, south], [east, north]]
const FOCUS_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-22, -36],   // SW corner — western Africa, southern tip of South Africa
  [98, 40],     // NE corner — northeast India/Bangladesh, northern Africa
]

// Layer scaffold — these toggle visibility on the (not-yet-wired) data layers.
// Real layers land in Phase 3 (cables, fibre) and Phase 4 (data centers).
type LayerKey =
  | "submarine-cables"
  | "fibre-lit"
  | "fibre-dark"
  | "fibre-planned"
  | "landing-points"
  | "data-centers-active"
  | "data-centers-construction"
  | "data-centers-planned"

type LayerConfig = {
  key:     LayerKey
  label:   string
  swatch:  React.ReactNode
  visible: boolean
}

const FIBRE_COLOR = "#FFB627"

const INITIAL_LAYERS: LayerConfig[] = [
  {
    key: "submarine-cables",
    label: "Submarine cables",
    swatch: <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: "#4ECDC4" }} />,
    visible: true,
  },
  {
    key: "fibre-lit",
    label: "Fibre — lit",
    swatch: <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: FIBRE_COLOR }} />,
    visible: true,
  },
  {
    key: "fibre-dark",
    label: "Fibre — dark (latent)",
    swatch: <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: FIBRE_COLOR, opacity: 0.4 }} />,
    visible: true,
  },
  {
    key: "fibre-planned",
    label: "Fibre — planned / in progress",
    swatch: (
      <span
        className="inline-block w-4 h-0 rounded-full"
        style={{ borderTop: `1.5px dashed ${FIBRE_COLOR}` }}
      />
    ),
    visible: true,
  },
  {
    key: "landing-points",
    label: "Landing points",
    swatch: <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />,
    visible: true,
  },
  {
    key: "data-centers-active",
    label: "Data centers — active",
    swatch: <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#2DD4BF" }} />,
    visible: true,
  },
  {
    key: "data-centers-construction",
    label: "Data centers — under construction",
    swatch: <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#FACC15" }} />,
    visible: true,
  },
  {
    key: "data-centers-planned",
    label: "Data centers — planned",
    swatch: (
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ border: "1.5px dashed #FB923C", background: "transparent" }}
      />
    ),
    visible: true,
  },
]

// ISO 3166-1 alpha-2 codes for highlighted regions: all of Africa + India + Pakistan.
// Used to dim country / place labels for non-focus regions on the basemap.
const FOCUS_ISO_A2 = [
  // Africa (54 countries)
  "DZ","AO","BJ","BW","BF","BI","CM","CV","CF","TD","KM","CG","CD","CI","DJ",
  "EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG",
  "MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO",
  "ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW",
  // South Asia focus
  "IN","PK",
]

export default function ComputeMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const [layers, setLayers] = useState<LayerConfig[]>(INITIAL_LAYERS)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [filterOpen, setFilterOpen]     = useState(true)

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     BASEMAP_STYLE,
      bounds:    FOCUS_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right")

    // Reusable popup for hover tooltips.
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
      className: "compute-map-popup",
    })

    map.on("load", async () => {
      // Dim country / place labels for non-focus regions. CARTO Dark Matter is
      // an OpenMapTiles style; its place layer features carry iso_a2.
      const focusExpr = [
        "case",
        ["in", ["get", "iso_a2"], ["literal", FOCUS_ISO_A2]],
        1,
        0.18,
      ] as unknown as maplibregl.ExpressionSpecification
      for (const layer of map.getStyle().layers ?? []) {
        const id = layer.id.toLowerCase()
        const looksLikeCountryLabel = id.includes("country") || id.includes("place_country")
        if (layer.type === "symbol" && looksLikeCountryLabel) {
          try {
            map.setPaintProperty(layer.id, "text-opacity", focusExpr)
          } catch { /* skip */ }
        }
      }

      // ─── Load data layers ───────────────────────────────────────────
      try {
        const [cablesRes, landingRes, corridorsRes, dcsRes] = await Promise.all([
          fetch("/data/compute-connectivity/cables.geojson"),
          fetch("/data/compute-connectivity/landing-points.geojson"),
          fetch("/data/compute-connectivity/approx-corridors.geojson"),
          fetch("/data/compute-connectivity/data-centers.geojson"),
        ])
        const cables    = await cablesRes.json()
        const landing   = await landingRes.json()
        const corridors = await corridorsRes.json()
        const dcs       = await dcsRes.json()

        map.addSource("cables", { type: "geojson", data: cables })
        map.addSource("landing", { type: "geojson", data: landing })
        map.addSource("approx-corridors", { type: "geojson", data: corridors })
        map.addSource("data-centers", { type: "geojson", data: dcs })
        // AfTerFibre vector source — fibre lines for all 29 covered African
        // countries. Schema carries `live` + `go_live` for status filtering.
        map.addSource("africa-fibre", {
          type: "vector",
          url:  AFRICA_FIBRE_TILEJSON,
          attribution: "Fibre data: AfTerFibre / NSRC (CC-BY-4.0)",
        })

        // Fibre layers — three states from the same vector source, distinguished
        // by filter on `live` + `go_live`. Per design spec: lit = solid full opacity,
        // dark = solid 40%, planned = dashed.
        // Insert BEFORE cables so cables render on top (cables are global scope).
        map.addLayer({
          id: "fibre-dark-line",
          type: "line",
          source: "africa-fibre",
          "source-layer": AFRICA_FIBRE_LAYER,
          filter: [
            "all",
            ["==", ["get", "live"], false],
            ["any",
              ["==", ["get", "go_live"], 0],
              ["==", ["get", "go_live"], null],
              ["<", ["get", "go_live"], CURRENT_YEAR],
            ],
          ],
          layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
          paint: {
            "line-color":   FIBRE_COLOR,
            "line-width":   ["interpolate", ["linear"], ["zoom"], 2, 0.5, 6, 1.0, 10, 1.6],
            "line-opacity": 0.4,
          },
        })
        map.addLayer({
          id: "fibre-planned-line",
          type: "line",
          source: "africa-fibre",
          "source-layer": AFRICA_FIBRE_LAYER,
          filter: [
            "all",
            ["==", ["get", "live"], false],
            [">=", ["get", "go_live"], CURRENT_YEAR],
          ],
          layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
          paint: {
            "line-color":     FIBRE_COLOR,
            "line-width":     ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.2, 10, 1.8],
            "line-opacity":   0.85,
            "line-dasharray": [3, 2],
          },
        })
        map.addLayer({
          id: "fibre-lit-line",
          type: "line",
          source: "africa-fibre",
          "source-layer": AFRICA_FIBRE_LAYER,
          filter: ["==", ["get", "live"], true],
          layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
          paint: {
            "line-color":   FIBRE_COLOR,
            "line-width":   ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.2, 10, 1.8],
            "line-opacity": 0.85,
          },
        })

        // Approximate corridors (India + Pakistan, hand-built). Visually treated
        // as lit fibre — operational by definition — with a hairline dash to
        // signal data quality. Tooltip says "Approximate route" explicitly.
        map.addLayer({
          id: "approx-corridors-line",
          type: "line",
          source: "approx-corridors",
          layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
          paint: {
            "line-color":     FIBRE_COLOR,
            "line-width":     ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.4, 10, 2.2],
            "line-opacity":   0.75,
            "line-dasharray": [1, 0.6],   // very tight dash — reads as solid at small zooms, distinct on close inspection
          },
        })

        // Cables — line layer using TeleGeography's per-cable color.
        map.addLayer({
          id: "cables-line",
          type: "line",
          source: "cables",
          layout: {
            "line-cap":  "round",
            "line-join": "round",
            visibility:  "visible",
          },
          paint: {
            "line-color":   ["coalesce", ["get", "color"], "#4ECDC4"],
            "line-width":   ["interpolate", ["linear"], ["zoom"], 1, 0.8, 4, 1.2, 8, 2.2],
            "line-opacity": 0.78,
          },
        })

        // Hit-detection layer for cables — wider invisible stroke makes
        // hover easier on thin lines.
        map.addLayer({
          id: "cables-hit",
          type: "line",
          source: "cables",
          layout: { visibility: "visible" },
          paint: {
            "line-color":   "#000",
            "line-width":   12,
            "line-opacity": 0,
          },
        })

        // Landing points — small red dots.
        map.addLayer({
          id: "landing-circle",
          type: "circle",
          source: "landing",
          layout: { visibility: "visible" },
          paint: {
            "circle-radius":       ["interpolate", ["linear"], ["zoom"], 2, 2, 6, 4, 10, 6],
            "circle-color":        "#EF4444",
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "rgba(255,255,255,0.85)",
            "circle-opacity":      0.92,
          },
        })

        // ── Data centers — status-coded markers ────────────────────────
        // Spec: active = teal filled, under construction = yellow filled,
        // planned = hollow orange with dashed stroke.
        // Sized by power_mw so larger clusters read first; min 4px so even
        // zero-power "under construction" facilities are visible.
        const dcRadiusExpr = [
          "interpolate", ["linear"], ["get", "power_mw"],
          0, 4,
          100, 5,
          500, 7,
          1000, 9,
          2000, 12,
        ] as unknown as maplibregl.ExpressionSpecification

        map.addLayer({
          id: "dc-active-circle",
          type: "circle",
          source: "data-centers",
          filter: ["==", ["get", "status"], "active"],
          layout: { visibility: "visible" },
          paint: {
            "circle-radius":       dcRadiusExpr,
            "circle-color":        "#2DD4BF",
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "rgba(255,255,255,0.9)",
            "circle-opacity":      0.92,
          },
        })

        map.addLayer({
          id: "dc-construction-circle",
          type: "circle",
          source: "data-centers",
          filter: ["==", ["get", "status"], "under_construction"],
          layout: { visibility: "visible" },
          paint: {
            "circle-radius":       dcRadiusExpr,
            "circle-color":        "#FACC15",
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "rgba(255,255,255,0.9)",
            "circle-opacity":      0.88,
          },
        })

        map.addLayer({
          id: "dc-planned-circle",
          type: "circle",
          source: "data-centers",
          filter: ["==", ["get", "status"], "planned"],
          layout: { visibility: "visible" },
          paint: {
            "circle-radius":       dcRadiusExpr,
            "circle-color":        "transparent",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#FB923C",
            "circle-opacity":      0.9,
          },
        })

        // ── Cable hover ────────────────────────────────────────────────
        let hoveredCableId: string | null = null
        map.on("mousemove", "cables-hit", (e) => {
          map.getCanvas().style.cursor = "pointer"
          if (!e.features || !e.features.length) return
          const f = e.features[0]
          const p = f.properties ?? {}
          const cid = String(p.id ?? f.id ?? "")
          if (cid === hoveredCableId) {
            popup.setLngLat(e.lngLat)
            return
          }
          hoveredCableId = cid
          const owners = typeof p.owners === "string" && p.owners.length > 80
            ? p.owners.slice(0, 78) + "…" : p.owners
          const rfs = p.rfs ?? p.rfs_year ?? "n/a"
          const planned = p.is_planned === true || p.is_planned === "true"
            ? '<span style="color:#FACC15;font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Planned</span>' : ""
          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                  <span style="display:inline-block;width:10px;height:2px;background:${p.color ?? "#4ECDC4"};border-radius:2px;"></span>
                  <span style="font-weight:600;color:#fff;font-size:12px;">${p.name ?? cid}</span>
                  ${planned}
                </div>
                <div style="opacity:.65;">RFS ${rfs}${p.length ? ` · ${p.length}` : ""}</div>
                ${owners ? `<div style="opacity:.55;margin-top:3px;">${owners}</div>` : ""}
              </div>
            `)
            .addTo(map)
        })
        map.on("mouseleave", "cables-hit", () => {
          map.getCanvas().style.cursor = ""
          hoveredCableId = null
          popup.remove()
        })

        // ── Fibre hover (any of the 3 status layers) ────────────────────
        for (const fibreLayerId of ["fibre-lit-line", "fibre-dark-line", "fibre-planned-line"]) {
          map.on("mousemove", fibreLayerId, (e) => {
            map.getCanvas().style.cursor = "pointer"
            if (!e.features || !e.features.length) return
            const p = e.features[0].properties ?? {}
            const isLit  = p.live === true || p.live === "true"
            const goLive = typeof p.go_live === "number" ? p.go_live : Number(p.go_live)
            const statusLabel =
              isLit ? "Lit" :
              goLive && goLive >= CURRENT_YEAR ? `Planned · go-live ${goLive}` :
              "Dark fibre (latent)"
            const statusColor = isLit ? "#FFB627"
              : goLive && goLive >= CURRENT_YEAR ? "#F87171"
              : "rgba(255,182,39,0.55)"
            popup
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <span style="display:inline-block;width:10px;height:2px;background:${statusColor};border-radius:2px;"></span>
                    <span style="font-weight:600;color:#fff;font-size:12px;">${p.operator_name ?? p.operator ?? "Fibre route"}</span>
                  </div>
                  <div style="opacity:.7;margin-bottom:2px;">${statusLabel}</div>
                  ${p.country ? `<div style="opacity:.55;">${p.country}</div>` : ""}
                  ${p.phase_name ? `<div style="opacity:.55;">${p.phase_name}</div>` : ""}
                  <div style="opacity:.4;font-size:9px;margin-top:4px;">Source: AfTerFibre / NSRC</div>
                </div>
              `)
              .addTo(map)
          })
          map.on("mouseleave", fibreLayerId, () => {
            map.getCanvas().style.cursor = ""
            popup.remove()
          })
        }

        // ── Approx corridor hover ───────────────────────────────────────
        map.on("mousemove", "approx-corridors-line", (e) => {
          map.getCanvas().style.cursor = "pointer"
          if (!e.features || !e.features.length) return
          const p = e.features[0].properties ?? {}
          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                  <span style="display:inline-block;width:10px;height:2px;background:${FIBRE_COLOR};border-radius:2px;"></span>
                  <span style="font-weight:600;color:#fff;font-size:12px;">${p.name ?? "Corridor"}</span>
                </div>
                <div style="opacity:.65;">${p.operators ?? ""}${p.country ? ` · ${p.country}` : ""}</div>
                <div style="color:#FACC15;margin-top:4px;font-size:10px;">⚠ Approximate route — operator network sketch, not precision GIS</div>
                <div style="opacity:.4;font-size:9px;margin-top:3px;">Source: ${p.source ?? "n/a"}</div>
              </div>
            `)
            .addTo(map)
        })
        map.on("mouseleave", "approx-corridors-line", () => {
          map.getCanvas().style.cursor = ""
          popup.remove()
        })

        // ── Landing-point hover ────────────────────────────────────────
        map.on("mouseenter", "landing-circle", () => { map.getCanvas().style.cursor = "pointer" })
        map.on("mousemove", "landing-circle", (e) => {
          if (!e.features || !e.features.length) return
          const f = e.features[0]
          const p = f.properties ?? {}
          popup
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                  <span style="display:inline-block;width:6px;height:6px;background:#EF4444;border-radius:50%;"></span>
                  <span style="font-weight:600;color:#fff;font-size:12px;">${p.name ?? "Landing point"}</span>
                </div>
                <div style="opacity:.65;">${p.country ?? ""}</div>
              </div>
            `)
            .addTo(map)
        })
        map.on("mouseleave", "landing-circle", () => {
          map.getCanvas().style.cursor = ""
          popup.remove()
        })

        // ── Data center hover ──────────────────────────────────────────
        for (const dcLayerId of ["dc-active-circle", "dc-construction-circle", "dc-planned-circle"]) {
          map.on("mouseenter", dcLayerId, () => { map.getCanvas().style.cursor = "pointer" })
          map.on("mousemove", dcLayerId, (e) => {
            if (!e.features || !e.features.length) return
            const p = e.features[0].properties ?? {}
            const statusLabel =
              p.status === "active" ? "Active"
              : p.status === "under_construction" ? "Under construction"
              : "Planned"
            const statusColor =
              p.status === "active" ? "#2DD4BF"
              : p.status === "under_construction" ? "#FACC15"
              : "#FB923C"
            const powerMW = Number(p.power_mw) || 0
            const h100    = Number(p.h100_equiv) || 0
            const capex   = Number(p.capex_b) || 0
            popup
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font:11px/1.4 system-ui,sans-serif;color:#E5EAF1;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <span style="display:inline-block;width:7px;height:7px;background:${statusColor};border-radius:50%;"></span>
                    <span style="font-weight:600;color:#fff;font-size:12px;">${p.name ?? "Data center"}</span>
                  </div>
                  <div style="opacity:.65;margin-bottom:3px;">${p.owner ?? ""}${p.users && p.users !== p.owner ? ` · used by ${p.users}` : ""}</div>
                  <div style="opacity:.55;font-size:10px;margin-bottom:4px;">
                    <span style="color:${statusColor};text-transform:uppercase;letter-spacing:.05em;font-weight:600;">${statusLabel}</span>
                    ${p.country ? ` · ${p.country}` : ""}
                  </div>
                  ${powerMW > 0 || h100 > 0 || capex > 0 ? `
                    <div style="opacity:.7;font-size:10px;display:flex;gap:10px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.1);">
                      ${powerMW > 0 ? `<span><strong style="color:#fff;">${powerMW >= 1000 ? (powerMW/1000).toFixed(1)+' GW' : Math.round(powerMW)+' MW'}</strong> power</span>` : ""}
                      ${h100 > 0 ? `<span><strong style="color:#fff;">${(h100/1000).toFixed(0)}k</strong> H100-eq</span>` : ""}
                      ${capex > 0 ? `<span><strong style="color:#fff;">$${capex.toFixed(1)}B</strong></span>` : ""}
                    </div>
                  ` : ""}
                  <div style="opacity:.4;font-size:9px;margin-top:5px;">Source: ${p.source ?? "n/a"}</div>
                </div>
              `)
              .addTo(map)
          })
          map.on("mouseleave", dcLayerId, () => {
            map.getCanvas().style.cursor = ""
            popup.remove()
          })
        }
      } catch (err) {
        // Don't crash the map if data files aren't present yet (Phase-1-only
        // deployments). Log + continue.
        // eslint-disable-next-line no-console
        console.warn("[ComputeMap] failed to load data layers:", err)
      }
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── Fullscreen toggle ──────────────────────────────────────────────────────
  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current?.parentElement)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  async function toggleFullscreen() {
    const el = containerRef.current?.parentElement
    if (!el) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await el.requestFullscreen()
    }
    // Map needs to recompute its viewport after fullscreen swap.
    setTimeout(() => mapRef.current?.resize(), 250)
  }

  // Map our React-side layer keys to the MapLibre layer IDs they control.
  // Some keys (fibre states, data center status) won't have backing layers
  // until later phases — toggling them is a no-op for now.
  const LAYER_ID_MAP: Partial<Record<LayerKey, string[]>> = {
    "submarine-cables":          ["cables-line", "cables-hit"],
    "landing-points":            ["landing-circle"],
    "fibre-lit":                 ["fibre-lit-line", "approx-corridors-line"],
    "fibre-dark":                ["fibre-dark-line"],
    "fibre-planned":             ["fibre-planned-line"],
    "data-centers-active":       ["dc-active-circle"],
    "data-centers-construction": ["dc-construction-circle"],
    "data-centers-planned":      ["dc-planned-circle"],
  }

  function toggleLayer(key: LayerKey) {
    setLayers((prev) => {
      const next = prev.map((l) => (l.key === key ? { ...l, visible: !l.visible } : l))
      const map = mapRef.current
      if (map) {
        const nowVisible = next.find((l) => l.key === key)?.visible ?? true
        const targetIds  = LAYER_ID_MAP[key] ?? []
        for (const id of targetIds) {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", nowVisible ? "visible" : "none")
          }
        }
      }
      return next
    })
  }

  return (
    <div
      className="relative w-full"
      style={{
        height: isFullscreen ? "100vh" : "calc(100vh - 220px)",
        minHeight: 520,
        background: "#0B132A",
      }}
    >
      {/* Map canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Fullscreen toggle — top-right (under MapLibre's nav controls) */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-3 right-14 rounded-md flex items-center justify-center"
        style={{
          width: 30,
          height: 30,
          background: "rgba(11, 19, 42, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          color: "rgba(255, 255, 255, 0.8)",
          backdropFilter: "blur(8px)",
        }}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 1v4H1M11 1v4h4M5 15v-4H1M11 15v-4h4" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 5V1h4M15 5V1h-4M1 11v4h4M15 11v4h-4" />
          </svg>
        )}
      </button>

      {/* Filter panel — bottom-left */}
      <div
        className="absolute bottom-4 left-4 rounded-lg overflow-hidden"
        style={{
          background: "rgba(11, 19, 42, 0.88)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          backdropFilter: "blur(12px)",
          width: filterOpen ? 252 : 168,
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
        }}
      >
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-left"
          style={{
            background: "transparent",
            borderBottom: filterOpen ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
            color: "rgba(255, 255, 255, 0.85)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>Layers</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>
            {filterOpen ? "−" : `+ (${layers.filter((l) => l.visible).length})`}
          </span>
        </button>
        {filterOpen && (
          <div className="px-3 py-2.5 flex flex-col gap-1.5">
            {layers.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => toggleLayer(l.key)}
                className="flex items-center gap-2.5 text-left transition-opacity"
                style={{ opacity: l.visible ? 1 : 0.35 }}
              >
                <span
                  className="w-3 h-3 rounded shrink-0 flex items-center justify-center"
                  style={{
                    background: l.visible ? "#4ECDC4" : "transparent",
                    border: `1.5px solid ${l.visible ? "#4ECDC4" : "rgba(255, 255, 255, 0.25)"}`,
                  }}
                >
                  {l.visible && (
                    <svg width="8" height="8" viewBox="0 0 9 9" fill="none">
                      <path d="M1.5 4.5 L3.6 6.6 L7.5 2.3" stroke="#0B132A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="shrink-0">{l.swatch}</span>
                <span
                  className="text-[11px]"
                  style={{ color: "rgba(255, 255, 255, 0.85)" }}
                >
                  {l.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
