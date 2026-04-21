import type { Job, JobsData, VerticalBreakdown, SocialImpactData } from "../types"

const VERTICALS = ["health_rd", "health_delivery", "agriculture", "education"] as const

// ── Sub-area canonicalization ─────────────────────────────────────────────────
// Canonical taxonomy (19 sub-areas across 4 categories):
//
//   engineering:  software_engineering | platform_infra | hardware | security | product_management
//   research:     research
//   sales_gtm:    sales | solutions | business_development | marketing | customer_success
//   operations:   program_management | finance | legal | hr | facilities | design | trust_safety | policy
//
// Everything maps to one of these. Old variants from prior classifier runs
// are remapped here so historical data stays readable.

const CANONICAL: Record<string, string> = {
  // ── engineering → software_engineering ───────────────────────────────────
  "software_engineer":          "software_engineering",
  "software_engineers":         "software_engineering",
  "software engineer":          "software_engineering",
  "full-stack":                 "software_engineering",
  "full_stack":                 "software_engineering",
  "backend":                    "software_engineering",
  "backend_systems":            "software_engineering",
  "backend_engineering":        "software_engineering",
  "frontend":                   "software_engineering",
  "frontend_engineering":       "software_engineering",
  "engineering":                "software_engineering",
  "systems":                    "software_engineering",
  "embedded_systems":           "software_engineering",
  "devops":                     "software_engineering",
  "devops_infra":               "software_engineering",
  // ML engineering → software_engineering (collapsed)
  "ml_engineering":             "software_engineering",
  "ml_engineer":                "software_engineering",
  "ml_engineers":               "software_engineering",
  "ml engineer":                "software_engineering",
  "ml engineering":             "software_engineering",
  "ML engineering":             "software_engineering",
  "ML engineer":                "software_engineering",
  "ML_engineer":                "software_engineering",
  "ML engineers":               "software_engineering",
  "ai_ml_engineer":             "software_engineering",
  "ml_systems":                 "software_engineering",
  "ml_ai_systems":              "software_engineering",

  // ── engineering → platform_infra ─────────────────────────────────────────
  "platform/infra":             "platform_infra",
  "platform":                   "platform_infra",
  "infra":                      "platform_infra",
  "infrastructure":             "platform_infra",
  "infrastructure_platform":    "platform_infra",
  "platform_infrastructure":    "platform_infra",
  "platform_engineer":          "platform_infra",
  "cloud_infra":                "platform_infra",
  "it_infrastructure":          "platform_infra",
  "systems_infra":              "platform_infra",
  "ml_infrastructure":          "platform_infra",
  "ml_infra":                   "platform_infra",
  "ml_platform":                "platform_infra",
  "ml_platform_infra":          "platform_infra",
  "ml/platform_infrastructure": "platform_infra",
  "ml/compiler_infrastructure": "platform_infra",
  "data_engineering":           "platform_infra",
  "data_engineer":              "platform_infra",
  "data engineering":           "platform_infra",
  "data_operations":            "platform_infra",
  "data operations":            "platform_infra",
  "data_platform":              "platform_infra",

  // ── engineering → hardware ────────────────────────────────────────────────
  "hardware_engineering":       "hardware",
  "hardware engineering":       "hardware",
  "hardware_infrastructure":    "hardware",
  "hardware/infrastructure":    "hardware",
  "hardware_manufacturing":     "hardware",
  "manufacturing_hardware":     "hardware",
  "hardware/silicon":           "hardware",
  "silicon_hardware":           "hardware",
  "hardware/platform":          "hardware",
  "hardware_engineer":          "hardware",
  "silicon_engineering":        "hardware",

  // ── engineering → product_management ─────────────────────────────────────
  "product_manager":            "product_management",
  "product management":         "product_management",
  "product":                    "product_management",

  // ── research → research ───────────────────────────────────────────────────
  "ml_research":                "research",
  "ai_research":                "research",
  "ai_ml_research":             "research",
  "ai/ml_research":             "research",
  "applied_ml_research":        "research",
  "scientific_ml":              "research",
  "generative_ai_research":     "research",
  "applied_research":           "research",
  "applied_science":            "research",
  "applied_scientist":          "research",
  "applied scientist":          "research",
  "applied sciences internship":"research",
  "research_engineer":          "research",
  "research_engineers":         "research",
  "research engineer":          "research",
  "research_engineering":       "research",
  "research engineering":       "research",
  "research_scientist":         "research",
  "research_intern":            "research",
  "research intern":            "research",
  "research_internship":        "research",
  "ai_safety":                  "research",
  "ai_safety_research":         "research",
  "alignment":                  "research",
  "interpretability":           "research",
  "ai_training":                "research",
  "core_research":              "research",
  "core ai research":           "research",
  "ml_researcher":              "research",
  "ai_researcher":              "research",
  "researcher":                 "research",
  "ai/ml_researcher":           "research",
  "AI/ML research":             "research",
  "AI/ML researchers":          "research",
  "ML research":                "research",
  "data_science":               "software_engineering",
  "data science":               "software_engineering",
  "data_scientist":             "software_engineering",
  "machine_learning":           "software_engineering",
  "machine_learning_research":  "research",

  // ── sales_gtm → sales ─────────────────────────────────────────────────────
  "sales_gtm":                  "sales",
  "sales_reps":                 "sales",
  "sales_rep":                  "sales",
  "sales reps":                 "sales",
  "sales management":           "sales",
  "sales_management":           "sales",
  "sales_leadership":           "sales",
  "sales_development":          "sales",
  "sales enablement":           "sales",
  "sales_enablement":           "sales",
  "account_executive":          "sales",
  "account_executives":         "sales",
  "field_sales":                "sales",
  "enterprise_sales":           "sales",
  "go_to_market":               "sales",
  "go-to-market":               "sales",

  // ── sales_gtm → solutions ─────────────────────────────────────────────────
  "solutions_architect":               "solutions",
  "solutions_architects":              "solutions",
  "solutions architect":               "solutions",
  "solutions_architect_technical":     "solutions",
  "solutions architect (technical)":   "solutions",
  "solutions architects (technical)":  "solutions",
  "solutions_architecture":            "solutions",
  "solutions architecture":            "solutions",
  "solutions_engineer":                "solutions",
  "solutions_engineers":               "solutions",
  "solutions engineer":                "solutions",
  "solutions_engineering":             "solutions",
  "solutions engineering":             "solutions",
  "solutions engineers (commercial)":  "solutions",
  "solutions architect (commercial)":  "solutions",
  "solutions_engineer_commercial":     "solutions",
  "applied_ai":                        "solutions",

  // ── sales_gtm → business_development ─────────────────────────────────────
  "business development":       "business_development",
  "partnerships":               "business_development",
  "partnerships_business_development": "business_development",

  // ── sales_gtm → customer_success ─────────────────────────────────────────
  "customer_support":           "customer_success",
  "customer_support_ops":       "customer_success",
  "customer support":           "customer_success",
  "account_management":         "customer_success",
  "account management":         "customer_success",
  "account_manager":            "customer_success",

  // ── operations → program_management ──────────────────────────────────────
  "program management":         "program_management",

  // ── operations → hr ───────────────────────────────────────────────────────
  "HR":                         "hr",
  "human_resources":            "hr",
  "recruiting":                 "hr",
  "people_ops":                 "hr",

  // ── operations → facilities ───────────────────────────────────────────────
  "facilities operations":      "facilities",
  "facilities_operations":      "facilities",
  "data_center_operations":     "facilities",
  "data center operations":     "facilities",
  "supply_chain":               "facilities",
  "procurement":                "facilities",
  "construction_facilities":    "facilities",
  "real_estate_facilities":     "facilities",

  // ── operations → trust_safety ─────────────────────────────────────────────
  "trust_and_safety":           "trust_safety",
  "trust_&_safety":             "trust_safety",
  "trust & safety":             "trust_safety",
  "Trust & Safety":             "trust_safety",

  // ── operations → policy ───────────────────────────────────────────────────
  "communications":             "policy",
  "comms":                      "policy",
  "government_affairs":         "policy",
  "policy_safety":              "policy",
  "external_affairs":           "policy",

  // ── operations → finance ──────────────────────────────────────────────────
  "accounting":                 "finance",
  "finance_ops":                "finance",
  "finance_tax":                "finance",

  // ── operations → legal ───────────────────────────────────────────────────
  "legal_operations":           "legal",
  "compliance":                 "legal",
  "risk_management":            "legal",

  // catch-all: old "other" → operations/program_management
  "other":                      "program_management",
  "unknown":                    "program_management",
}

function normalizeSubArea(raw: string): string {
  // Normalize spacing/slashes/case → look up in CANONICAL
  const key = raw.trim().toLowerCase().replace(/[\s\/\-&]+/g, "_")
  // Try depluralized form for cases like "software_engineers" → "software_engineer"
  const depluraled = key.endsWith("s") && !key.endsWith("ss") && !key.endsWith("us")
    ? key.slice(0, -1)
    : key
  return CANONICAL[raw] ?? CANONICAL[key] ?? CANONICAL[depluraled] ?? key
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
