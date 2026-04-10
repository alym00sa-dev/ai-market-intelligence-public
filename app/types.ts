export type JobCategory = "engineering" | "sales_gtm" | "research" | "operations" | "other" | "unclassified"

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
}

export type CompanySummary = {
  total: number
  by_category: Partial<Record<JobCategory, number>>
}

export type JobsData = {
  scraped_at: string | null
  total_jobs: number
  companies: Record<string, CompanySummary>
  company_summaries?: Record<string, { building: string[]; selling: string[] }>
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
}

export type CompanyProfile = {
  company: string
  total: number
  categoryBreakdown: Record<string, number>
  buildingInsights: SubAreaInsight[]
  sellingInsights: SubAreaInsight[]
  // LLM-generated summaries (present after running scraper with summarizer)
  llmSummary?: CompanySummary_LLM
}
