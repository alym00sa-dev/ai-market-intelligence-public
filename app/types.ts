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
