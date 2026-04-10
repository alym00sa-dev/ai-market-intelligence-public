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
