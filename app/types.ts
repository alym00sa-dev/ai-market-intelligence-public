export type JobCategory = "engineering" | "sales_gtm" | "research" | "operations" | "other" | "unclassified"

export type JobVertical = "health_rd" | "health_delivery" | "agriculture" | "education"

export type Job = {
  id: string
  company: string
  title: string
  department: string
  location: string
  url: string
  source: string
  category: JobCategory | null
  sub_area: string | null
  what: string | null
  tags: string[]
  vertical?: JobVertical | null
  social_impact?: boolean
}

export type CompanySummary = {
  total: number
  by_category: Partial<Record<JobCategory, number>>
}

export type JobsData = {
  scraped_at: string | null
  total_jobs: number
  companies: Record<string, CompanySummary>
  company_summaries?: Record<string, {
    building: string[]
    selling: string[]
    vertical_bullets?: Record<string, string[]>
    social_impact_bullets?: string[]
  }>
  jobs: Job[]
}

export type SubAreaInsight = {
  subArea: string
  count: number
  locations: string[]
  tags: string[]
}

export type CompanySummary_LLM = {
  building: string[]
  selling: string[]
  vertical_bullets?: Record<string, string[]>
  social_impact_bullets?: string[]
}

export type VerticalBreakdown = Record<string, number>

export type SocialImpactData = {
  count: number
  pct: number
  byCategory: Record<string, number>
}

// ── Frontier Model Tracking ───────────────────────────────────────────────────

export type ModelRecord = {
  id: string
  name: string
  slug: string
  org: string
  country: string
  release_date: string | null
  open_weight: boolean | null
  param_count: number | null
  license: string | null
  modalities: string[]
  // Benchmarks
  intelligence_index: number | null
  coding_index: number | null
  math_index: number | null
  gpqa: number | null
  hle: number | null
  mmlu_pro: number | null
  livecodebench: number | null
  ifbench: number | null
  lcr: number | null
  aime_25: number | null
  // Pricing
  price_input: number | null
  price_output: number | null
  price_blended: number | null
  // Speed
  tokens_per_sec: number | null
  ttft: number | null
}

export type RankedModel = {
  rank: number
  model_id: string
  model_name: string
  organization: string
  score: number
  open_weight: boolean
  min_input_price: number | null
}

export type ModelsData = {
  built_at: string
  model_count: number
  open_count: number
  org_count: number
  models: ModelRecord[]
  rankings: Record<string, { category: string; ranked_at: string; models: RankedModel[] }>
}

// ── Compute Distribution ──────────────────────────────────────────────────────

export type ConfidenceEntry = { name: string; confidence: string }

export type LinkedSource = {
  score: number
  source_company: string
  source_type: string
  source_title: string
  source_url: string
  source_date: string
  source_form: string
  facility_name: string | null
  capacity_mw: number | null
  capacity_gw: number | null
  capex_billion_usd: number | null
  compute_type: string | null
  timeline_raw: string | null
  operational_date: string | null
  source_quote: string | null
  confidence: string | null
}

export type TimelineRow = {
  date: string
  status: string
  power_mw: number
  it_power_mw: number
  buildings_operational: string
}

export type EpochFacility = {
  name: string
  company_key: string
  company_display: string
  owner: ConfidenceEntry[]
  users: ConfidenceEntry[]
  country: string
  country_short: string
  state: string | null
  address: string
  power_mw: number | null
  h100_equiv: number | null
  capex_b: number | null
  project: string
  operational_date: string | null
  timeline_bucket: "now" | "+18m" | "+3y" | "beyond" | "unknown"
  linked_sources: LinkedSource[]
  near_matches: LinkedSource[]
  timeline: TimelineRow[]
}

export type AnnouncedInvestment = {
  source_company: string
  source_type: string
  source_title: string
  source_url: string
  source_date: string
  facility_name: string | null
  location_country: string | null
  location_state: string | null
  location_city: string | null
  capacity_mw: number | null
  capacity_gw: number | null
  capex_billion_usd: number | null
  compute_type: string | null
  timeline_raw: string | null
  operational_date: string | null
  confidence: string | null
  has_capacity: boolean
}

export type ComputeData = {
  built_at: string
  timeline_anchor: string
  stats: {
    epoch_facility_count: number
    total_current_power_mw: number
    total_current_h100_equiv: number
    announced_claim_count: number
    by_bucket: Record<string, { count: number; power_mw: number }>
    by_company: Record<string, { count: number; power_mw: number; h100_equiv: number }>
  }
  facilities: EpochFacility[]
  announced_investments: AnnouncedInvestment[]
}

export type CompanyProfile = {
  company: string
  total: number
  categoryBreakdown: Record<string, number>
  buildingInsights: SubAreaInsight[]
  sellingInsights: SubAreaInsight[]
  llmSummary?: CompanySummary_LLM
  verticalBreakdown: VerticalBreakdown
  socialImpactData: SocialImpactData
}

// ── Rep Risk Safety ───────────────────────────────────────────────────────────

export type RepRiskSeverity = "low" | "medium" | "high"

export type RepRiskIncident = {
  summary: string
  severity: RepRiskSeverity
  severity_rationale: string
  source: string
  url: string
  date: string
  title: string
}

export type RepRiskCell = {
  commitment_present: boolean
  commitments: string[]
  issue_detected: boolean
  potential_issue: string | null
  incidents: RepRiskIncident[]
}

export type RepRiskLab = {
  name: string
  display_name: string
  framework_name: string
  snapshot_date: string
  categories: Record<string, RepRiskCell>
}

export type RepRiskData = {
  generated_at: string
  categories: string[]
  category_descriptions: Record<string, string>
  labs: RepRiskLab[]
}
