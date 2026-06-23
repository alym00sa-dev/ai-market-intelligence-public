"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import type { FeatureCollection } from "geojson"

// ─── Types shared with the server component ────────────────────────────────

export type ReadinessMetric = {
  key: string
  label: string
  unit: string
  goodHigh: boolean
  min: number
  max: number
}

export type MapMode = "fiber" | "readiness"

const ComputeMap = dynamic(() => import("./ComputeMap"), {
  ssr: false,
  loading: () => <div className="w-full rounded-xl" style={{ height: "calc(100vh - 200px)", minHeight: 520, background: "var(--bg-elevated)" }} />,
})

// Readiness color ramp (light → deep green); mirrors the fill ramp in ComputeMap.
const RAMP = ["#EDF3F0", "#BBDFC8", "#84C79E", "#4E9E74", "#226B49"]

const FIBER_LEGEND: { label: string; swatch: React.ReactNode }[] = [
  { label: "Submarine cable", swatch: <span className="inline-block w-4 h-[2px] rounded-full" style={{ background: "#179C8E" }} /> },
  { label: "Fibre — lit",     swatch: <span className="inline-block w-4 h-[2px] rounded-full" style={{ background: "#E8A317" }} /> },
  { label: "Fibre — dark",    swatch: <span className="inline-block w-4 h-[2px] rounded-full" style={{ background: "#E8A317", opacity: 0.4 }} /> },
  { label: "Fibre — planned", swatch: <span className="inline-block w-4 h-0" style={{ borderTop: "1.5px dashed #E8A317" }} /> },
  { label: "Landing point",   swatch: <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#EF4444" }} /> },
  { label: "Data center",     swatch: <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#0FB5A6" }} /> },
]

export default function ComputeConnectivityView({
  readinessGeo,
  metrics,
}: {
  readinessGeo: FeatureCollection
  metrics: ReadinessMetric[]
}) {
  const [mode, setMode] = useState<MapMode>("fiber")
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? "")
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0]

  return (
    <div className="flex-1 flex flex-col px-4 sm:px-6 py-4">
      {/* Title — top left only */}
      <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", color: "var(--text-primary)", lineHeight: 1.15 }}>
        Compute &amp; Connectivity Map
      </h1>
      <p className="text-[11px] mt-1.5 max-w-3xl" style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        Sources: submarine cables &amp; landing points — TeleGeography; terrestrial fibre — AfTerFibre / NSRC; data centers —
        Epoch AI; connectivity — World Bank Global Findex 2024 &amp; GSMA Intelligence; readiness — World Bank GovTech Maturity Index 2025.
      </p>

      {/* Center control row: Fiber | Readiness toggle (+ metric select) */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-3 mb-3">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
          {(["fiber", "readiness"] as MapMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="px-5 py-1.5 text-[13px] font-medium transition-colors capitalize"
              style={mode === m ? { background: "var(--accent-blue)", color: "#fff" } : { background: "transparent", color: "var(--text-secondary)" }}>
              {m}
            </button>
          ))}
        </div>
        {mode === "readiness" && (
          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Metric</span>
            <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)} className="text-[12px] rounded-md px-2 py-1.5"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
              {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
        <ComputeMap mode={mode} metricKey={metricKey} metrics={metrics} readinessGeo={readinessGeo} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-3">
        {mode === "fiber"
          ? FIBER_LEGEND.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {l.swatch}{l.label}
              </span>
            ))
          : metric && (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {metric.goodHigh ? "low" : "high"} {metric.min}{metric.unit}
              </span>
              <span className="inline-flex h-2.5 w-40 rounded-full overflow-hidden" style={{ background: `linear-gradient(to right, ${(metric.goodHigh ? RAMP : [...RAMP].reverse()).join(",")})` }} />
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {metric.goodHigh ? "high" : "low"} {metric.max}{metric.unit}
              </span>
              <span className="inline-flex items-center gap-1.5 ml-3">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#E3E6EA", border: "1px solid var(--border-subtle)" }} />no data
              </span>
            </div>
          )}
      </div>
    </div>
  )
}
