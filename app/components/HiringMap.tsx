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
  "Anthropic":     "#D97757",
  "OpenAI":        "#10A37F",
  "Google":        "#4285F4",
  "xAI":           "#1F1F1F",
  "Meta":          "#1877F2",
  "Microsoft":     "#00A4EF",
  "Amazon":        "#FF9900",
  "NVIDIA":        "#76B900",
  "Mistral AI":    "#FF6B35",
  "Cohere":        "#39594D",
  "Inflection AI": "#06B6D4",
  "Stability AI":  "#A855F7",
  "Moonshot AI":   "#EF4444",
  "ByteDance":     "#F43F5E",
}

const CATEGORY_COLORS: Record<string, string> = {
  engineering:    "#2C4D9E",   // accent-blue
  research:       "#C77F2E",   // accent-amber
  sales_gtm:      "#2D8F66",   // accent-green
  operations:     "#6B5BC9",   // muted indigo
  other:          "#BCC4D2",
  unclassified:   "#DDE3EC",
}
const CATEGORY_LABELS: Record<string, string> = {
  engineering: "Engineering", research: "Research", sales_gtm: "Sales / GTM",
  operations: "Operations", other: "Other", unclassified: "Unclassified",
}

const VERTICAL_COLORS: Record<string, string> = {
  health_rd:       "#B83A3A",   // safety/red family
  health_delivery: "#D97757",   // coral
  agriculture:     "#2D8F66",   // green
  education:       "#2C4D9E",   // navy
}
const VERTICAL_LABELS: Record<string, string> = {
  health_rd: "Health R&D", health_delivery: "Health Delivery",
  agriculture: "Agriculture", education: "Education",
}

const THEME_COLORS: Record<string, string> = {
  foundation_pretraining: "#2C4D9E", post_training_rl: "#C77F2E", reasoning: "#7C3AED",
  multimodal: "#0EA5E9", agents_tool_use: "#2D8F66", interpretability: "#DB2777",
  alignment_safety: "#B83A3A", evals_red_teaming: "#D97706", security_misuse: "#475569",
  biosecurity_cbrn: "#16A34A", robotics_embodied: "#9333EA", training_infra_compute: "#1F2A5A",
  inference_serving: "#0891B2", data_pipeline: "#65A30D", product_app_layer: "#E11D48",
  developer_platform: "#0D9488",
}
const THEME_LABELS: Record<string, string> = {
  foundation_pretraining: "Pretraining", post_training_rl: "Post-training/RL", reasoning: "Reasoning",
  multimodal: "Multimodal", agents_tool_use: "Agents/Tool-use", interpretability: "Interpretability",
  alignment_safety: "Alignment & Safety", evals_red_teaming: "Evals/Red-teaming", security_misuse: "Security/Misuse",
  biosecurity_cbrn: "Biosecurity/CBRN", robotics_embodied: "Robotics/Embodied", training_infra_compute: "Training Infra",
  inference_serving: "Inference/Serving", data_pipeline: "Data Pipeline", product_app_layer: "Product/App",
  developer_platform: "Developer Platform",
}

type ViewMode = "company" | "role" | "vertical" | "theme"
type DeepColor = "company" | "role" | "theme"

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
    if (mode === "theme" && !job.theme) continue
    const coords = cityCoords(job.location)
    if (!coords) continue

    const city = (job.location ?? "").split(",")[0].trim()
    const rawKey =
      mode === "company"  ? job.company :
      mode === "role"     ? (job.category ?? "unclassified") :
      mode === "theme"    ? (job.theme ?? "none") :
                            (job.vertical ?? "none")
    const colorKey = mode === "company" ? displayName(rawKey) : rawKey

    const color =
      mode === "company"  ? (COMPANY_COLORS[colorKey] ?? "#8E97AC") :
      mode === "role"     ? (CATEGORY_COLORS[colorKey] ?? "#8E97AC") :
      mode === "theme"    ? (THEME_COLORS[colorKey] ?? "#8E97AC") :
                            (VERTICAL_COLORS[colorKey] ?? "#DDE3EC")

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
    mode === "theme"    ? Object.entries(THEME_COLORS) :
                          Object.entries(VERTICAL_COLORS)

  return [
    "match", ["get", "colorKey"],
    ...entries.flatMap(([k, v]) => [k, v]),
    "#8E97AC",
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
    <div
      className="absolute bottom-8 left-3 z-10 backdrop-blur-sm rounded-xl shadow-sm px-3 py-2.5 max-w-[260px]"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <p
        className="text-[9px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "var(--text-tertiary)" }}
      >
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
              <span
                className="text-[10px] font-medium"
                style={{ color: active ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
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
        <span style="font-size:13px;font-weight:600;color:#0F1E3D;">${city}</span>
        <span style="margin-left:auto;font-size:11px;color:#8E97AC;white-space:nowrap;">${count} role${count !== 1 ? "s" : ""}</span>
      </div>`
    : `<div style="display:flex;align-items:center;gap:7px;padding-top:10px;margin-top:10px;border-top:1px solid #DDE3EC;">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
        <span style="font-size:12px;font-weight:600;color:#4A5878;">${colorKey}</span>
        <span style="margin-left:auto;font-size:10px;color:#8E97AC;white-space:nowrap;">${count} role${count !== 1 ? "s" : ""}</span>
      </div>`

  const limit = pinned ? samples.length : 3
  const jobRows = samples.slice(0, limit).map((j) => `
    <div style="padding-top:6px;margin-top:6px;border-top:1px solid #EDF0F6;">
      <div style="font-size:11px;font-weight:500;color:#0F1E3D;line-height:1.3;">${j.title}</div>
      <div style="font-size:10px;color:#8E97AC;margin-top:1px;">${j.company}</div>
      ${j.what ? `<div style="font-size:10px;color:#4A5878;margin-top:3px;line-height:1.4;">${j.what.slice(0, 120)}${j.what.length > 120 ? "…" : ""}</div>` : ""}
      ${j.url ? `<a href="${j.url}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#2C4D9E;text-decoration:none;display:inline-block;margin-top:3px;">View posting →</a>` : ""}
    </div>
  `).join("")

  const more = !pinned && count > 3
    ? `<div style="font-size:10px;color:#8E97AC;padding-top:5px;margin-top:5px;">+${count - 3} more — click dot to expand</div>`
    : ""

  return `${header}${jobRows}${more}`
}

function buildPopupHTML(allProps: Record<string, unknown>[], pinned = false): string {
  const city = allProps[0].city as string
  const totalCount = allProps.reduce((s, p) => s + (p.count as number), 0)

  const cityHeader = allProps.length > 1
    ? `<div style="font-size:12px;font-weight:600;color:#4A5878;margin-bottom:4px;">📍 ${city} · ${totalCount} total roles</div>`
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
  const [deepColor, setDeepColor] = useState<DeepColor>("company")
  const [subFilters, setSubFilters] = useState<Set<string>>(new Set())

  // Deep-dive: once one OR MORE companies are filtered in company mode, you can recolor
  // the filtered set by role/theme (the cross-cut the siloed modes can't show) while
  // keeping the multi-company filter intact. deepColor="company" = normal company colors.
  const focusMode = mode === "company" && filters.size >= 1
  const colorBy: ViewMode = focusMode ? deepColor : mode

  // Clear filters when switching top-level modes; clear sub-filters when focus changes.
  useEffect(() => { setFilters(new Set()); setDeepColor("company") }, [mode])
  useEffect(() => { setSubFilters(new Set()) }, [deepColor, focusMode])

  function makeToggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    return (key: string) => setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggleFilter = makeToggle(setFilters)
  const toggleSubFilter = makeToggle(setSubFilters)

  // Jobs in the currently-filtered companies (pool for role/theme sub-breakdowns).
  const companyPool = useMemo(
    () => (filters.size > 0 ? jobs.filter((j) => filters.has(displayName(j.company))) : jobs),
    [jobs, filters],
  )

  // Legend reflects the active coloring dimension. In a role/theme deep-dive it shows
  // the sub-categories (and filters them); otherwise it shows + filters companies.
  const filterOptions = useMemo(() => {
    if (colorBy === "company") {
      const seen = [...new Set(jobs.map((j) => displayName(j.company)))].sort()
      return seen.map((c) => ({ key: c, label: c, color: COMPANY_COLORS[c] ?? "#8E97AC" }))
    }
    if (colorBy === "role") {
      const seen = new Set<string>(companyPool.map((j) => j.category ?? "unclassified"))
      return Object.keys(CATEGORY_COLORS).filter((k) => seen.has(k))
        .map((k) => ({ key: k, label: CATEGORY_LABELS[k] ?? k, color: CATEGORY_COLORS[k] }))
    }
    if (colorBy === "theme") {
      const seen = new Set<string>(companyPool.filter((j) => j.theme).map((j) => j.theme as string))
      return Object.keys(THEME_COLORS).filter((k) => seen.has(k))
        .map((k) => ({ key: k, label: THEME_LABELS[k] ?? k, color: THEME_COLORS[k] }))
    }
    const seen = new Set<string>(jobs.filter((j) => j.vertical).map((j) => j.vertical as string))
    return Object.keys(VERTICAL_COLORS).filter((k) => seen.has(k))
      .map((k) => ({ key: k, label: VERTICAL_LABELS[k] ?? k, color: VERTICAL_COLORS[k] }))
  }, [colorBy, jobs, companyPool])

  const filteredJobs = useMemo(() => {
    let result = jobs
    // Primary filter is always by company in company mode (multi-select).
    if (filters.size > 0) {
      result = result.filter((job) => {
        if (mode === "company") return filters.has(displayName(job.company))
        if (mode === "role")    return filters.has(job.category ?? "unclassified")
        if (mode === "theme")   return job.theme != null && filters.has(job.theme)
        return job.vertical != null && filters.has(job.vertical as string)
      })
    }
    // Deep-dive sub-filter on the role/theme dimension.
    if (focusMode && (colorBy === "role" || colorBy === "theme") && subFilters.size > 0) {
      result = result.filter((job) => {
        if (colorBy === "role")  return subFilters.has(job.category ?? "unclassified")
        return job.theme != null && subFilters.has(job.theme)
      })
    }
    return result
  }, [jobs, filters, mode, focusMode, subFilters, colorBy])

  const clusters = buildClusters(filteredJobs, colorBy)
  const legendIsSub = focusMode && (colorBy === "role" || colorBy === "theme")

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
    map.setPaintProperty("jobs-circles", "circle-color", colorExpression(colorBy))
  }, [colorBy, mapReady, clusters])

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
      <div
        className="absolute top-3 left-3 z-10 flex items-center gap-1 backdrop-blur-sm rounded-xl shadow-sm px-2 py-1.5"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {tabs.map((t) => {
          const active = mode === t.key
          return (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
              style={
                active
                  ? { background: "var(--accent-blue)", color: "#FFFFFF" }
                  : { background: "transparent", color: "var(--text-secondary)" }
              }
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Role count overlay — top right */}
      <div
        className="absolute top-3 right-12 z-10 backdrop-blur-sm rounded-xl shadow-sm px-3 py-1.5"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <span
          className="text-[11px] font-mono tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {totalShown.toLocaleString()} roles · {clusters.length} locations
          {mode === "vertical" && (
            <span className="ml-1" style={{ color: "var(--accent-amber)" }}>
              {" "}(vertical only)
            </span>
          )}
        </span>
      </div>

      {/* Deep-dive sub-toggle — appears once one or more companies are filtered */}
      {focusMode && (
        <div
          className="absolute top-14 left-3 z-10 flex items-center gap-2 backdrop-blur-sm rounded-xl shadow-sm px-2.5 py-1.5"
          style={{ background: "rgba(255, 255, 255, 0.92)", border: "1px solid var(--border-subtle)" }}
        >
          <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {filters.size} {filters.size === 1 ? "company" : "companies"}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>color by</span>
          {(["company", "role", "theme"] as DeepColor[]).map((dc) => {
            const active = deepColor === dc
            const label = dc === "company" ? "Company" : dc === "role" ? "Role" : "Theme"
            return (
              <button
                key={dc}
                onClick={() => setDeepColor(dc)}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
                style={active
                  ? { background: "var(--accent-blue)", color: "#FFFFFF" }
                  : { background: "transparent", color: "var(--text-secondary)" }}
              >
                {label}
              </button>
            )
          })}
          <button
            onClick={() => { setFilters(new Set()); setDeepColor("company") }}
            className="ml-1 text-[12px] leading-none"
            style={{ color: "var(--text-tertiary)" }}
            title="Clear company filter"
          >
            ✕
          </button>
        </div>
      )}

      {/* Legend overlay — bottom left (doubles as filter; in a role/theme deep-dive it filters the sub-dimension) */}
      <Legend
        options={filterOptions}
        filters={legendIsSub ? subFilters : filters}
        onToggle={legendIsSub ? toggleSubFilter : toggleFilter}
      />
    </div>
  )
}
