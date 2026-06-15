import fs from "fs"
import path from "path"
import ComputeConnectivityView, {
  type BreakdownData,
} from "../components/ComputeConnectivityView"

type GeoJSONFeature = {
  type: "Feature"
  properties: Record<string, unknown> | null
  geometry: unknown
}
type GeoJSONFC = { features: GeoJSONFeature[] }

function safeReadJSON<T>(rel: string, fallback: T): T {
  try {
    const p = path.join(process.cwd(), "public", "data", "compute-connectivity", rel)
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T
  } catch {
    return fallback
  }
}

/** Build per-country derived metrics from the cable + data-center geometry files. */
function computeDerived(): Record<string, { cableCount: number; dcActive: number; dcConstruction: number; activeMW: number; pipelineMW: number }> {
  const cables   = safeReadJSON<GeoJSONFC>("cables.geojson", { features: [] })
  const dcs      = safeReadJSON<GeoJSONFC>("data-centers.geojson", { features: [] })

  const out: Record<string, { cableCount: number; dcActive: number; dcConstruction: number; activeMW: number; pipelineMW: number }> = {}
  const bump = (country: string, patch: Partial<{ cableCount: number; dcActive: number; dcConstruction: number; activeMW: number; pipelineMW: number }>) => {
    const key = country.trim()
    if (!out[key]) out[key] = { cableCount: 0, dcActive: 0, dcConstruction: 0, activeMW: 0, pipelineMW: 0 }
    if (patch.cableCount)     out[key].cableCount     += patch.cableCount
    if (patch.dcActive)       out[key].dcActive       += patch.dcActive
    if (patch.dcConstruction) out[key].dcConstruction += patch.dcConstruction
    if (patch.activeMW)       out[key].activeMW       += patch.activeMW
    if (patch.pipelineMW)     out[key].pipelineMW     += patch.pipelineMW
  }

  // Cables — count distinct countries each cable touches.
  for (const f of cables.features) {
    const lps = (f.properties?.landing_points ?? []) as Array<{ country?: string }>
    const touchedCountries = new Set(lps.map((lp) => (lp?.country ?? "").trim()).filter(Boolean))
    for (const c of touchedCountries) bump(c, { cableCount: 1 })
  }

  // Data centers — bucket by status.
  for (const f of dcs.features) {
    const p = f.properties ?? {}
    const country = String(p.country ?? "").trim()
    if (!country) continue
    const status = String(p.status ?? "")
    const power  = Number(p.power_mw ?? 0)
    if (status === "active") {
      bump(country, { dcActive: 1, activeMW: power })
    } else if (status === "under_construction" || status === "planned") {
      bump(country, { dcConstruction: 1, pipelineMW: power })
    }
  }

  return out
}

export default function ComputePage() {
  // Country tables (from the HTML reference extraction).
  type GovtechCountry = {
    country: string
    code:    string
    values:  Record<string, string>
  }
  type ConnectivityCountry = {
    country:        string
    code:           string
    mobile_own?:    number
    smartphone?:    number
    daily_mobile?:  number
    daily_internet?: number
    digital_payment?: number
    mobile_women?:  number
    mobile_men?:    number
    internet_women?: number
    internet_men?:  number
    literacy?:      number
    internet_3mo?:  number
  }

  const govtechRaw = safeReadJSON<{ countries: GovtechCountry[] }>("govtech.json", { countries: [] })
  const connectRaw = safeReadJSON<{ countries: ConnectivityCountry[] }>("connectivity-metrics.json", { countries: [] })

  const govtechByCountry  = Object.fromEntries(govtechRaw.countries.map((c) => [c.country, c]))
  const connectByCountry  = Object.fromEntries(connectRaw.countries.map((c) => [c.country, c]))
  const derivedByCountry  = computeDerived()

  // Country-name aliases: data-center / cable / connectivity sources sometimes
  // disagree on punctuation/short forms. Map data-source name → our display name.
  const ALIAS: Record<string, string> = {
    "Congo, Dem. Rep.": "DRC",
    "Democratic Republic of the Congo": "DRC",
    "Côte d'Ivoire":    "Ivory Coast",
  }
  const breakdown: BreakdownData = {
    govtechByCountry,
    connectByCountry,
    derivedByCountry,
    aliases: ALIAS,
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ComputeConnectivityView breakdown={breakdown} />
    </div>
  )
}
