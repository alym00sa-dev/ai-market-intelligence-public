import fs from "fs"
import path from "path"
import { feature } from "topojson-client"
import type { Topology } from "topojson-specification"
import type { FeatureCollection, Geometry } from "geojson"
import countries110m from "world-atlas/countries-110m.json"
import ComputeConnectivityView, {
  type ReadinessMetric,
} from "../components/ComputeConnectivityView"

function safeReadJSON<T>(rel: string, fallback: T): T {
  try {
    const p = path.join(process.cwd(), "public", "data", "compute-connectivity", rel)
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T
  } catch {
    return fallback
  }
}

type ConnectivityCountry = {
  country: string; code: string
  mobile_own?: number; smartphone?: number; daily_internet?: number; internet_3mo?: number
  digital_payment?: number; literacy?: number; internet_men?: number; internet_women?: number
}
type GovtechCountry = { country: string; code: string; values: Record<string, string> }

// Data country name → name as it appears in world-atlas countries-110m.
const NAME_TO_ATLAS: Record<string, string> = { DRC: "Dem. Rep. Congo" }

// The selectable metrics that can color the readiness choropleth. `key` is the
// feature property the map reads; min/max are filled in from the data below.
const METRIC_DEFS: Omit<ReadinessMetric, "min" | "max">[] = [
  { key: "internet_3mo",    label: "Internet use",        unit: "%",   goodHigh: true  },
  { key: "smartphone",      label: "Smartphone adoption", unit: "%",   goodHigh: true  },
  { key: "mobile_own",      label: "Mobile ownership",    unit: "%",   goodHigh: true  },
  { key: "digital_payment", label: "Digital payments",    unit: "%",   goodHigh: true  },
  { key: "literacy",        label: "Adult literacy",      unit: "%",   goodHigh: true  },
  { key: "gender_gap",      label: "Internet gender gap", unit: "pts", goodHigh: false },
  { key: "gtmi",            label: "GovTech Maturity",    unit: "",    goodHigh: true  },
]

export default function ComputePage() {
  const connectRaw = safeReadJSON<{ countries: ConnectivityCountry[] }>("connectivity-metrics.json", { countries: [] })
  const govtechRaw = safeReadJSON<{ countries: GovtechCountry[] }>("govtech.json", { countries: [] })
  const gtmiByCode = Object.fromEntries(
    govtechRaw.countries.map((c) => [c.code, parseFloat(c.values?.["GTMI Score"] ?? "") || null]),
  )

  // Per-country readiness props, keyed by the world-atlas country name.
  type Props = Record<string, number | string | boolean | null>
  const byAtlasName: Record<string, Props> = {}
  for (const c of connectRaw.countries) {
    const gap = c.internet_men != null && c.internet_women != null ? +(c.internet_men - c.internet_women).toFixed(1) : null
    const atlasName = NAME_TO_ATLAS[c.country] ?? c.country
    byAtlasName[atlasName] = {
      name: c.country, iso3: c.code, hasData: true,
      internet_3mo: c.internet_3mo ?? null, smartphone: c.smartphone ?? null,
      mobile_own: c.mobile_own ?? null, digital_payment: c.digital_payment ?? null,
      literacy: c.literacy ?? null, daily_internet: c.daily_internet ?? null,
      internet_men: c.internet_men ?? null, internet_women: c.internet_women ?? null,
      gender_gap: gap, gtmi: gtmiByCode[c.code] ?? null,
    }
  }

  // Metric min/max across the data countries (drives the color ramp domain).
  const metrics: ReadinessMetric[] = METRIC_DEFS.map((m) => {
    const vals = Object.values(byAtlasName)
      .map((p) => p[m.key])
      .filter((v): v is number => typeof v === "number")
    return { ...m, min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 1 }
  })

  // World country polygons → attach readiness props to the ones we have data for.
  const topo = countries110m as unknown as Topology
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, Record<string, unknown>>
  const readinessGeo: FeatureCollection<Geometry, Props> = {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      const nm = String(f.properties?.name ?? "")
      const props = byAtlasName[nm] ?? { name: nm, hasData: false }
      return { type: "Feature", geometry: f.geometry, properties: props }
    }),
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ComputeConnectivityView readinessGeo={readinessGeo} metrics={metrics} />
    </div>
  )
}
