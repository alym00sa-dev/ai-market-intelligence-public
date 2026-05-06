"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import type { Job } from "../types"
import { cityCoords } from "../lib/geo"

// ── Constants ─────────────────────────────────────────────────────────────────

// Free CARTO Positron style — clean light basemap, no API key required
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"

const DISPLAY_NAMES: Record<string, string> = {
  "Amazon AGI":         "Amazon",
  "Microsoft Research": "Microsoft",
  "Google DeepMind":    "Google",
}

function displayName(raw: string): string {
  return DISPLAY_NAMES[raw] ?? raw
}

const COMPANY_COLORS: Record<string, string> = {
  "Anthropic":  "#6366f1",
  "OpenAI":     "#10b981",
  "Google":     "#3b82f6",
  "xAI":        "#f59e0b",
  "Mistral AI": "#ec4899",
  "Cohere":     "#8b5cf6",
  "NVIDIA":     "#22c55e",
  "Amazon":     "#f97316",
  "Microsoft":  "#0ea5e9",
  "Inflection AI": "#06b6d4",
  "Stability AI":  "#a855f7",
  "Moonshot AI":   "#ef4444",
  "ByteDance":     "#f43f5e",
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
    const rawKey =
      mode === "company"  ? job.company :
      mode === "role"     ? (job.category ?? "unclassified") :
                            (job.vertical ?? "none")
    const colorKey = mode === "company" ? displayName(rawKey) : rawKey

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
        company: displayName(job.company),
        what: (job.what && !job.what.startsWith("Classification failed")) ? job.what : "",
        url: job.url ?? "",
      })
    }
  }

  return Object.values(groups)
}

// Spread overlapping clusters at the same city so dots don't stack on each other
function jitterClusters(clusters: JobCluster[]): JobCluster[] {
  const byCityBase: Record<string, JobCluster[]> = {}
  for (const c of clusters) {
    const key = c.city
    if (!byCityBase[key]) byCityBase[key] = []
    byCityBase[key].push(c)
  }
  return clusters.map((c) => {
    const siblings = byCityBase[c.city]
    if (siblings.length <= 1) return c
    const idx = siblings.indexOf(c)
    const n   = siblings.length
    const r   = 0.22
    const angle = (2 * Math.PI * idx) / n - Math.PI / 2
    return { ...c, lon: c.lon + r * Math.cos(angle), lat: c.lat + r * Math.sin(angle) }
  })
}

function clustersToGeoJSON(clusters: JobCluster[]) {
  const jittered = jitterClusters(clusters)
  return {
    type: "FeatureCollection" as const,
    features: jittered.map((c) => ({
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

function Legend({
  options,
  filters,
  onToggle,
}: {
  options: { key: string; label: string; color: string }[]
  filters: Set<string>
  onToggle: (key: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="absolute bottom-8 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/80 shadow-sm px-3 py-2.5 max-w-[260px]">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
        Click to filter
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {options.map(({ key, label, color }) => {
          const active = filters.has(key)
          const dimmed = filters.size > 0 && !active
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className="flex items-center gap-1.5 transition-opacity"
              style={{ opacity: dimmed ? 0.35 : 1 }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 transition-transform"
                style={{
                  backgroundColor: color,
                  transform: active ? "scale(1.3)" : "scale(1)",
                  boxShadow: active ? `0 0 0 2px white, 0 0 0 3px ${color}` : "none",
                }}
              />
              <span className={`text-[10px] font-medium ${active ? "text-slate-900" : "text-slate-600"}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Popup HTML ────────────────────────────────────────────────────────────────

function buildGroupSection(props: Record<string, unknown>, showCity: boolean, pinned: boolean): string {
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

  const limit = pinned ? samples.length : 3
  const jobRows = samples.slice(0, limit).map((j) => `
    <div style="padding-top:6px;margin-top:6px;border-top:1px solid #f8fafc;">
      <div style="font-size:11px;font-weight:500;color:#1e293b;line-height:1.3;">${j.title}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:1px;">${j.company}</div>
      ${j.what ? `<div style="font-size:10px;color:#64748b;margin-top:3px;line-height:1.4;">${j.what.slice(0, 120)}${j.what.length > 120 ? "…" : ""}</div>` : ""}
      ${j.url ? `<a href="${j.url}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#6366f1;text-decoration:none;display:inline-block;margin-top:3px;">View posting →</a>` : ""}
    </div>
  `).join("")

  const more = !pinned && count > 3
    ? `<div style="font-size:10px;color:#94a3b8;padding-top:5px;margin-top:5px;">+${count - 3} more — click dot to expand</div>`
    : ""

  return `${header}${jobRows}${more}`
}

function buildPopupHTML(allProps: Record<string, unknown>[], pinned = false): string {
  const city = allProps[0].city as string
  const totalCount = allProps.reduce((s, p) => s + (p.count as number), 0)

  const cityHeader = allProps.length > 1
    ? `<div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:4px;">📍 ${city} · ${totalCount} total roles</div>`
    : ""

  const sections = allProps.map((p, i) => buildGroupSection(p, i === 0 && allProps.length === 1, pinned)).join("")

  const maxH = pinned ? "520px" : "340px"
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:300px;padding:4px 2px;max-height:${maxH};overflow-y:auto;">${cityHeader}${sections}</div>`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HiringMap({ jobs }: { jobs: Job[] }) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<maplibregl.Map | null>(null)
  const hoverPopupRef   = useRef<maplibregl.Popup | null>(null)
  const pinnedPopupRef  = useRef<maplibregl.Popup | null>(null)
  const [mode, setMode]       = useState<ViewMode>("company")
  const [mapReady, setMapReady] = useState(false)
  const [filters, setFilters] = useState<Set<string>>(new Set())

  // Clear filters when switching modes
  useEffect(() => { setFilters(new Set()) }, [mode])

  function toggleFilter(key: string) {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filterOptions = useMemo(() => {
    if (mode === "company") {
      const seen = [...new Set(jobs.map((j) => displayName(j.company)))].sort()
      return seen.map((c) => ({ key: c, label: c, color: COMPANY_COLORS[c] ?? "#94a3b8" }))
    }
    if (mode === "role") {
      const seen = new Set<string>(jobs.map((j) => j.category ?? "unclassified"))
      return Object.keys(CATEGORY_COLORS)
        .filter((k) => seen.has(k))
        .map((k) => ({ key: k, label: CATEGORY_LABELS[k] ?? k, color: CATEGORY_COLORS[k] }))
    }
    const seen = new Set<string>(jobs.filter((j) => j.vertical).map((j) => j.vertical as string))
    return Object.keys(VERTICAL_COLORS)
      .filter((k) => seen.has(k))
      .map((k) => ({ key: k, label: VERTICAL_LABELS[k] ?? k, color: VERTICAL_COLORS[k] }))
  }, [mode, jobs])

  const filteredJobs = useMemo(() => {
    if (filters.size === 0) return jobs
    return jobs.filter((job) => {
      if (mode === "company") return filters.has(displayName(job.company))
      if (mode === "role")    return filters.has(job.category ?? "unclassified")
      return job.vertical != null && filters.has(job.vertical as string)
    })
  }, [jobs, filters, mode])

  const clusters = buildClusters(filteredJobs, mode)

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

    const popupOpts = {
      closeOnClick: false,
      maxWidth: "320px",
      anchor: "right" as const,
      offset: [-8, 0] as [number, number],
      className: "hiring-map-popup",
    }
    hoverPopupRef.current  = new maplibregl.Popup({ ...popupOpts, closeButton: false })
    pinnedPopupRef.current = new maplibregl.Popup({ ...popupOpts, closeButton: true })

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

      // Helper: given a hovered feature, collect ALL features for that city in the viewport
      function featuresForCity(hoveredCity: string) {
        const all = map.queryRenderedFeatures(undefined, { layers: ["jobs-circles"] })
        const seen = new Set<string>()
        return all.filter((f) => {
          if (f.properties?.city !== hoveredCity) return false
          const key = `${f.properties?.city}::${f.properties?.colorKey}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }

      map.on("mouseenter", "jobs-circles", (e) => {
        map.getCanvas().style.cursor = "pointer"
        if (pinnedPopupRef.current?.isOpen()) return
        if (!e.features?.length) return
        const hoveredCity = e.features[0].properties?.city as string
        if (!hoveredCity) return
        const unique = featuresForCity(hoveredCity)
        if (!unique.length) return
        const anchor = e.features[0]
        if (anchor.geometry.type !== "Point") return
        const coords = anchor.geometry.coordinates as [number, number]
        hoverPopupRef.current!
          .setLngLat(coords)
          .setHTML(buildPopupHTML(unique.map((f) => f.properties as Record<string, unknown>)))
          .addTo(map)
      })

      map.on("mousemove", "jobs-circles", (e) => {
        if (pinnedPopupRef.current?.isOpen()) return
        if (!e.features?.length) { hoverPopupRef.current!.remove(); return }
        const hoveredCity = e.features[0].properties?.city as string
        if (!hoveredCity) { hoverPopupRef.current!.remove(); return }
        const unique = featuresForCity(hoveredCity)
        if (!unique.length) { hoverPopupRef.current!.remove(); return }
        const anchor = e.features[0]
        if (anchor.geometry.type !== "Point") return
        const coords = anchor.geometry.coordinates as [number, number]
        hoverPopupRef.current!
          .setLngLat(coords)
          .setHTML(buildPopupHTML(unique.map((f) => f.properties as Record<string, unknown>)))
          .addTo(map)
      })

      map.on("mouseleave", "jobs-circles", () => {
        map.getCanvas().style.cursor = ""
        if (!pinnedPopupRef.current?.isOpen()) hoverPopupRef.current!.remove()
      })

      map.on("click", "jobs-circles", (e) => {
        if (!e.features?.length) return
        const hoveredCity = e.features[0].properties?.city as string
        if (!hoveredCity) return
        const unique = featuresForCity(hoveredCity)
        if (!unique.length) return
        const anchor = e.features[0]
        if (anchor.geometry.type !== "Point") return
        const coords = anchor.geometry.coordinates as [number, number]
        hoverPopupRef.current!.remove()
        pinnedPopupRef.current!
          .setLngLat(coords)
          .setHTML(buildPopupHTML(unique.map((f) => f.properties as Record<string, unknown>), true))
          .addTo(map)
      })

      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["jobs-circles"] })
        if (!hits.length) pinnedPopupRef.current!.remove()
      })

      setMapReady(true)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Update data + colors when mode or filters change ───────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const src = map.getSource("jobs") as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData(clustersToGeoJSON(clusters) as GeoJSON.FeatureCollection)
    map.setPaintProperty("jobs-circles", "circle-color", colorExpression(mode))
  }, [mode, filters, mapReady, clusters])

  const tabs: { key: ViewMode; label: string }[] = [
    { key: "company",  label: "By Company" },
    { key: "role",     label: "By Role Type" },
    { key: "vertical", label: "By Vertical" },
  ]

  const totalShown = clusters.reduce((s, c) => s + c.count, 0)

  return (
    <div className="relative" style={{ height: "calc(100vh - 280px)", minHeight: 600 }}>
      {/* Map fills the entire container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Mode tabs overlay — top left */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/80 shadow-sm px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              mode === t.key
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Role count overlay — top right */}
      <div className="absolute top-3 right-12 z-10 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200/80 shadow-sm px-3 py-1.5">
        <span className="text-[11px] text-slate-500 tabular-nums">
          {totalShown.toLocaleString()} roles · {clusters.length} locations
          {mode === "vertical" && <span className="ml-1 text-violet-500"> (vertical only)</span>}
        </span>
      </div>

      {/* Legend overlay — bottom left (doubles as filter) */}
      <Legend options={filterOptions} filters={filters} onToggle={toggleFilter} />
    </div>
  )
}
