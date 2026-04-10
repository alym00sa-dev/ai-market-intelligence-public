"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import type { Job } from "../types"
import { cityCoords } from "../lib/geo"

// ── Constants ─────────────────────────────────────────────────────────────────

// Free CARTO Positron style — clean light basemap, no API key required
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

const COMPANY_COLORS: Record<string, string> = {
  "Anthropic":       "#6366f1",
  "OpenAI":          "#10b981",
  "Google DeepMind": "#3b82f6",
  "xAI":             "#f59e0b",
  "Mistral AI":      "#ec4899",
  "Cohere":          "#8b5cf6",
  "NVIDIA":          "#22c55e",
  "Amazon AGI":      "#f97316",
  "Inflection AI":   "#06b6d4",
  "Stability AI":    "#a855f7",
  "Moonshot AI":     "#ef4444",
}

const CATEGORY_COLORS: Record<string, string> = {
  engineering:    "#6366f1",
  research:       "#8b5cf6",
  sales_gtm:      "#10b981",
  operations:     "#f59e0b",
  other:          "#94a3b8",
  unclassified:   "#cbd5e1",
}
const CATEGORY_LABELS: Record<string, string> = {
  engineering: "Engineering", research: "Research", sales_gtm: "Sales / GTM",
  operations: "Operations", other: "Other", unclassified: "Unclassified",
}

const VERTICAL_COLORS: Record<string, string> = {
  health_rd:       "#ef4444",
  health_delivery: "#f97316",
  agriculture:     "#22c55e",
  education:       "#3b82f6",
}
const VERTICAL_LABELS: Record<string, string> = {
  health_rd: "Health R&D", health_delivery: "Health Delivery",
  agriculture: "Agriculture", education: "Education",
}

type ViewMode = "company" | "role" | "vertical"

// ── GeoJSON builder ───────────────────────────────────────────────────────────

type JobCluster = {
  city: string
  colorKey: string
  color: string
  count: number
  lon: number
  lat: number
  sampleJobs: { title: string; company: string; what: string; url: string }[]
}

function buildClusters(jobs: Job[], mode: ViewMode): JobCluster[] {
  const groups: Record<string, JobCluster> = {}

  for (const job of jobs) {
    if (mode === "vertical" && !job.vertical) continue
    const coords = cityCoords(job.location)
    if (!coords) continue

    const city = (job.location ?? "").split(",")[0].trim()
    const colorKey =
      mode === "company"  ? job.company :
      mode === "role"     ? (job.category ?? "unclassified") :
                            (job.vertical ?? "none")

    const color =
      mode === "company"  ? (COMPANY_COLORS[colorKey] ?? "#94a3b8") :
      mode === "role"     ? (CATEGORY_COLORS[colorKey] ?? "#94a3b8") :
                            (VERTICAL_COLORS[colorKey] ?? "#cbd5e1")

    const key = `${city}::${colorKey}`
    if (!groups[key]) {
      groups[key] = { city, colorKey, color, count: 0, lon: coords[1], lat: coords[0], sampleJobs: [] }
    }
    groups[key].count++
    if (groups[key].sampleJobs.length < 6) {
      groups[key].sampleJobs.push({
        title: job.title,
        company: job.company,
        what: (job.what && !job.what.startsWith("Classification failed")) ? job.what : "",
        url: job.url ?? "",
      })
    }
  }

  return Object.values(groups)
}

function clustersToGeoJSON(clusters: JobCluster[]) {
  return {
    type: "FeatureCollection" as const,
    features: clusters.map((c) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
      properties: {
        city: c.city,
        colorKey: c.colorKey,
        color: c.color,
        count: c.count,
        sampleJobs: JSON.stringify(c.sampleJobs),
      },
    })),
  }
}

// ── Color paint expression ────────────────────────────────────────────────────

function colorExpression(mode: ViewMode): maplibregl.ExpressionSpecification {
  const entries =
    mode === "company"  ? Object.entries(COMPANY_COLORS) :
    mode === "role"     ? Object.entries(CATEGORY_COLORS) :
                          Object.entries(VERTICAL_COLORS)

  return [
    "match", ["get", "colorKey"],
    ...entries.flatMap(([k, v]) => [k, v]),
    "#94a3b8",
  ] as unknown as maplibregl.ExpressionSpecification
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ mode, clusters }: { mode: ViewMode; clusters: JobCluster[] }) {
  const seen = new Set(clusters.map((c) => c.colorKey))

  const entries: { key: string; label: string; color: string }[] =
    mode === "company"
      ? [
          ...Object.entries(COMPANY_COLORS)
            .filter(([k]) => seen.has(k))
            .map(([k, c]) => ({ key: k, label: k, color: c })),
          ...(([...seen].some((k) => !COMPANY_COLORS[k])) ? [{ key: "other", label: "Other", color: "#94a3b8" }] : []),
        ]
      : mode === "role"
      ? Object.entries(CATEGORY_COLORS)
          .filter(([k]) => seen.has(k))
          .map(([k, c]) => ({ key: k, label: CATEGORY_LABELS[k] ?? k, color: c }))
      : Object.entries(VERTICAL_COLORS)
          .filter(([k]) => seen.has(k))
          .map(([k, c]) => ({ key: k, label: VERTICAL_LABELS[k] ?? k, color: c }))

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
      {entries.map(({ key, label, color }) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[11px] text-slate-500">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Popup HTML ────────────────────────────────────────────────────────────────

function buildGroupSection(props: Record<string, unknown>, showCity: boolean): string {
  const city    = props.city as string
  const count   = props.count as number
  const color   = props.color as string
  const colorKey = props.colorKey as string
  const samples = JSON.parse(props.sampleJobs as string) as { title: string; company: string; what: string; url: string }[]

  const header = showCity
    ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
        <span style="font-size:13px;font-weight:600;color:#1e293b;">${city}</span>
        <span style="margin-left:auto;font-size:11px;color:#94a3b8;white-space:nowrap;">${count} role${count !== 1 ? "s" : ""}</span>
      </div>`
    : `<div style="display:flex;align-items:center;gap:7px;padding-top:10px;margin-top:10px;border-top:1px solid #e2e8f0;">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
        <span style="font-size:12px;font-weight:600;color:#334155;">${colorKey}</span>
        <span style="margin-left:auto;font-size:10px;color:#94a3b8;white-space:nowrap;">${count} role${count !== 1 ? "s" : ""}</span>
      </div>`

  const jobRows = samples.slice(0, 3).map((j) => `
    <div style="padding-top:6px;margin-top:6px;border-top:1px solid #f8fafc;">
      <div style="font-size:11px;font-weight:500;color:#1e293b;line-height:1.3;">${j.title}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:1px;">${j.company}</div>
      ${j.what ? `<div style="font-size:10px;color:#64748b;margin-top:3px;line-height:1.4;">${j.what.slice(0, 100)}${j.what.length > 100 ? "…" : ""}</div>` : ""}
      ${j.url ? `<a href="${j.url}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#6366f1;text-decoration:none;display:inline-block;margin-top:3px;">View posting →</a>` : ""}
    </div>
  `).join("")

  const more = count > 3 ? `<div style="font-size:10px;color:#94a3b8;padding-top:5px;margin-top:5px;">+${count - 3} more</div>` : ""

  return `${header}${jobRows}${more}`
}

function buildPopupHTML(allProps: Record<string, unknown>[]): string {
  const city = allProps[0].city as string
  const totalCount = allProps.reduce((s, p) => s + (p.count as number), 0)

  const cityHeader = allProps.length > 1
    ? `<div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:4px;">📍 ${city} · ${totalCount} total roles</div>`
    : ""

  const sections = allProps.map((p, i) => buildGroupSection(p, i === 0 && allProps.length === 1)).join("")

  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:300px;padding:4px 2px;max-height:400px;overflow-y:auto;">${cityHeader}${sections}</div>`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HiringMap({ jobs }: { jobs: Job[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const popupRef     = useRef<maplibregl.Popup | null>(null)
  const [mode, setMode]       = useState<ViewMode>("company")
  const [mapReady, setMapReady] = useState(false)

  const clusters = buildClusters(jobs, mode)

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 25],
      zoom: 1.8,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), "top-right")
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right")

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "300px",
      className: "hiring-map-popup",
    })

    map.on("load", () => {
      map.addSource("jobs", {
        type: "geojson",
        data: clustersToGeoJSON(buildClusters(jobs, "company")),
      })

      map.addLayer({
        id: "jobs-circles",
        type: "circle",
        source: "jobs",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "count"],
            1, 6,
            10, 11,
            50, 16,
            200, 22,
            700, 30,
          ],
          "circle-color": colorExpression("company"),
          "circle-opacity": 0.82,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      })

      // Hover — query ALL overlapping features at the cursor point
      map.on("mouseenter", "jobs-circles", (e) => {
        map.getCanvas().style.cursor = "pointer"
        // Expand hit area slightly so stacked dots are all captured
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 4, e.point.y - 4],
          [e.point.x + 4, e.point.y + 4],
        ]
        const features = map.queryRenderedFeatures(bbox, { layers: ["jobs-circles"] })
        if (!features.length) return

        // Deduplicate by colorKey (same dot rendered multiple times at different zoom levels)
        const seen = new Set<string>()
        const unique = features.filter((f) => {
          const key = `${f.properties?.city}::${f.properties?.colorKey}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        const anchorFeature = unique[0]
        if (anchorFeature.geometry.type !== "Point") return
        const coords = anchorFeature.geometry.coordinates as [number, number]

        popupRef.current!
          .setLngLat(coords)
          .setHTML(buildPopupHTML(unique.map((f) => f.properties as Record<string, unknown>)))
          .addTo(map)
      })

      map.on("mousemove", "jobs-circles", (e) => {
        // Refresh on move so fast hover transitions feel snappy
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 4, e.point.y - 4],
          [e.point.x + 4, e.point.y + 4],
        ]
        const features = map.queryRenderedFeatures(bbox, { layers: ["jobs-circles"] })
        if (!features.length) { popupRef.current!.remove(); return }

        const seen = new Set<string>()
        const unique = features.filter((f) => {
          const key = `${f.properties?.city}::${f.properties?.colorKey}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        const anchorFeature = unique[0]
        if (anchorFeature.geometry.type !== "Point") return
        const coords = anchorFeature.geometry.coordinates as [number, number]
        popupRef.current!
          .setLngLat(coords)
          .setHTML(buildPopupHTML(unique.map((f) => f.properties as Record<string, unknown>)))
          .addTo(map)
      })

      map.on("mouseleave", "jobs-circles", () => {
        map.getCanvas().style.cursor = ""
        popupRef.current!.remove()
      })

      setMapReady(true)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Update data + colors when mode changes ──────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const src = map.getSource("jobs") as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData(clustersToGeoJSON(clusters) as GeoJSON.FeatureCollection)
    map.setPaintProperty("jobs-circles", "circle-color", colorExpression(mode))
  }, [mode, mapReady, clusters])

  const tabs: { key: ViewMode; label: string }[] = [
    { key: "company",  label: "By Company" },
    { key: "role",     label: "By Role Type" },
    { key: "vertical", label: "By Vertical" },
  ]

  const totalShown = clusters.reduce((s, c) => s + c.count, 0)

  return (
    <div>
      {/* Tabs + count */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              mode === t.key
                ? "bg-indigo-50 text-indigo-600"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
          {totalShown.toLocaleString()} roles · {clusters.length} locations
          {mode === "vertical" && <span className="ml-1 text-violet-400">(vertical-tagged only)</span>}
        </span>
      </div>

      {/* Legend — top */}
      <Legend mode={mode} clusters={clusters} />

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: 780 }}>
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}
