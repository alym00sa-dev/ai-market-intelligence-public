import type { Job, JobsData, VerticalBreakdown, SocialImpactData } from "../types"

const VERTICALS = ["health_rd", "health_delivery", "agriculture", "education"] as const

// ── Sub-area canonicalization ─────────────────────────────────────────────────
// The Haiku classifier produces 159 unique sub_area strings with inconsistent
// formatting (spaces, camelCase, slashes, plurals). We normalize then merge
// near-duplicates into canonical keys before display.

const CANONICAL: Record<string, string> = {
  // ML Research consolidation
  "ai_ml_research":        "ml_research",
  "ai/ml_research":        "ml_research",
  "ai_research":           "ml_research",
  "ai/ml_researcher":      "ml_research",
  "applied_ml_research":   "ml_research",
  "scientific_ml":         "ml_research",
  "generative_ai_research":"ml_research",
  "applied_research":      "ml_research",
  "applied_science":       "ml_research",

  // Software Engineering consolidation
  "software_engineer":     "software_engineering",
  "software_engineers":    "software_engineering",
  "full-stack":            "software_engineering",
  "engineering":           "software_engineering",

  // Research Engineering consolidation
  "research_engineer":     "research_engineering",
  "research_engineers":    "research_engineering",
  "research_science":      "research_engineering",

  // ML Engineering consolidation
  "ml_engineer":           "ml_engineering",
  "ml_engineers":          "ml_engineering",
  "ml_engineering":        "ml_engineering",
  "ml engineer":           "ml_engineering",
  "ml engineering":        "ml_engineering",
  "ml engineers":          "ml_engineering",
  "ai_ml_engineer":        "ml_engineering",

  // Platform / Infrastructure consolidation
  "platform/infra":        "platform_infra",
  "platform_engineer":     "platform_infra",
  "ml_infrastructure":     "platform_infra",
  "ml/platform_infrastructure": "platform_infra",
  "ml/compiler_infrastructure": "platform_infra",
  "systems/infra":         "platform_infra",
  "infra":                 "platform_infra",
  "cloud_infra":           "platform_infra",
  "it_infrastructure":     "platform_infra",

  // DevOps consolidation
  "devops_infra":          "devops",

  // Hardware consolidation
  "hardware_engineering":  "hardware",
  "hardware_infrastructure":"hardware",
  "hardware/infrastructure":"hardware",
  "hardware_manufacturing": "hardware",
  "manufacturing_hardware": "hardware",

  // Safety Research consolidation
  "ai_safety":             "ai_safety_research",
  "ai_training":           "ai_safety_research",
  "alignment":             "ai_safety_research",
  "interpretability":      "ai_safety_research",

  // Sales/GTM consolidation
  "go_to_market":          "sales_gtm",
  "go-to-market":          "sales_gtm",
  "sales":                 "sales_gtm",
  "sales_development":     "sales_gtm",

  // Solutions Engineering consolidation
  "solutions_engineer":    "solutions_engineering",
  "solutions_engineers":   "solutions_engineering",
  "solutions_architect":   "solutions_engineering",
  "solutions_architecture":"solutions_engineering",

  // Customer Success/Support consolidation
  "customer_support":      "customer_success",
  "customer_support_ops":  "customer_success",

  // Trust & Safety consolidation
  "trust_and_safety":      "trust_safety",
  "trust_&_safety":        "trust_safety",
  "trust & safety":        "trust_safety",

  // HR consolidation
  "hr":                    "human_resources",
  "HR":                    "human_resources",
  "HR/compensation":       "human_resources",
  "HR/people_ops":         "human_resources",

  // Data consolidation
  "data_quality":          "data_operations",
  "data_annotation":       "data_operations",
}

function normalizeSubArea(raw: string): string {
  // Normalize spacing/slashes/case
  const key = raw.trim().toLowerCase().replace(/[\s\/\-&]+/g, "_")
  // De-pluralize trailing 's' for common cases
  const depluraled = key.endsWith("s") && !key.endsWith("ss") && !key.endsWith("us")
    ? key.slice(0, -1)
    : key
  return CANONICAL[key] ?? CANONICAL[depluraled] ?? key
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubAreaDetail = {
  subArea: string        // canonical key e.g. "platform_infra"
  label: string          // display name e.g. "Platform Infra"
  count: number
  pct: number            // pct of section total
  topTitles: string[]    // top 5 most common job titles (activated — was dead code)
  topLocations: string[] // top 3 cities
  whatSamples: string[]  // up to 4 `what` sentences (filtered: no "Classification failed.")
}

export type GeoRow = {
  city: string
  count: number
  pct: number
  byCategory: Record<string, number>
}

export type CompanyDetailData = {
  company: string
  total: number
  categoryBreakdown: Record<string, number>
  llmSummary?: {
    building: string[]
    selling: string[]
    vertical_bullets?: Record<string, string[]>
    social_impact_bullets?: string[]
  }
  buildingAreas: SubAreaDetail[]
  sellingAreas: SubAreaDetail[]
  geoBreakdown: GeoRow[]
  verticalBreakdown: VerticalBreakdown
  socialImpactData: SocialImpactData
  allJobs: Job[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function freqSort(arr: string[]): string[] {
  const freq: Record<string, number> = {}
  arr.forEach((s) => { if (s) freq[s] = (freq[s] ?? 0) + 1 })
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([s]) => s)
}

export function formatLabel(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Sub-area computation ──────────────────────────────────────────────────────

function computeSubAreas(jobs: Job[], sectionTotal: number): SubAreaDetail[] {
  // Step 1: Normalize and consolidate sub_area keys
  const grouped: Record<string, Job[]> = {}
  jobs.forEach((j) => {
    const key = j.sub_area?.trim() ? normalizeSubArea(j.sub_area) : "__none__"
    grouped[key] = grouped[key] ?? []
    grouped[key].push(j)
  })

  return Object.entries(grouped)
    .filter(([k]) => k !== "__none__" && k !== "unknown" && k !== "other")
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8) // cap at 8 after consolidation
    .map(([subArea, grp]) => ({
      subArea,
      label: formatLabel(subArea),
      count: grp.length,
      pct: sectionTotal > 0 ? Math.round((grp.length / sectionTotal) * 100) : 0,
      // topTitles: now rendered as "Sample roles" — activated from dead code
      topTitles: freqSort(grp.map((j) => j.title)).slice(0, 5),
      topLocations: freqSort(
        grp.flatMap((j) => (j.location ? [j.location.split(",")[0].trim()] : []))
      ).slice(0, 3),
      // Filter out failed classifications; show up to 4 real descriptions
      whatSamples: grp
        .filter((j) => j.what && !j.what.startsWith("Classification failed"))
        .slice(0, 4)
        .map((j) => j.what!),
    }))
}

// ── Geography computation ─────────────────────────────────────────────────────

function computeGeo(jobs: Job[], total: number): GeoRow[] {
  const geo: Record<string, Job[]> = {}
  jobs.forEach((j) => {
    const city = j.location?.split(",")[0]?.trim()
    if (!city) return
    geo[city] = geo[city] ?? []
    geo[city].push(j)
  })

  return Object.entries(geo)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([city, cityJobs]) => {
      const byCategory: Record<string, number> = {}
      cityJobs.forEach((j) => {
        const cat = j.category ?? "unclassified"
        byCategory[cat] = (byCategory[cat] ?? 0) + 1
      })
      return {
        city,
        count: cityJobs.length,
        pct: total > 0 ? Math.round((cityJobs.length / total) * 100) : 0,
        byCategory,
      }
    })
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeCompanyDetail(
  data: JobsData,
  company: string
): CompanyDetailData | null {
  const jobs = data.jobs.filter((j) => j.company === company)
  if (jobs.length === 0) return null

  const total = jobs.length

  const categoryBreakdown: Record<string, number> = {}
  jobs.forEach((j) => {
    const cat = j.category ?? "unclassified"
    categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1
  })

  const buildingJobs = jobs.filter(
    (j) => j.category === "engineering" || j.category === "research"
  )
  const sellingJobs = jobs.filter((j) => j.category === "sales_gtm")

  const verticalBreakdown: VerticalBreakdown = Object.fromEntries(
    VERTICALS.map((v) => [v, jobs.filter((j) => j.vertical === v).length])
  )

  const siJobs = jobs.filter((j) => j.social_impact === true)
  const siByCategory: Record<string, number> = {}
  siJobs.forEach((j) => {
    const cat = j.category ?? "unclassified"
    siByCategory[cat] = (siByCategory[cat] ?? 0) + 1
  })
  const socialImpactData: SocialImpactData = {
    count: siJobs.length,
    pct: total > 0 ? Math.round((siJobs.length / total) * 100) : 0,
    byCategory: siByCategory,
  }

  return {
    company,
    total,
    categoryBreakdown,
    llmSummary: data.company_summaries?.[company],
    buildingAreas: computeSubAreas(buildingJobs, buildingJobs.length),
    sellingAreas: computeSubAreas(sellingJobs, sellingJobs.length),
    geoBreakdown: computeGeo(jobs, total),
    verticalBreakdown,
    socialImpactData,
    allJobs: jobs,
  }
}
