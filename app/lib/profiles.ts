import type { Job, JobsData, CompanyProfile, SubAreaInsight } from "../types"

const PINNED = ["OpenAI", "Anthropic", "Google DeepMind", "NVIDIA"]

function freqSort(arr: string[]): string[] {
  const freq: Record<string, number> = {}
  arr.forEach((s) => { if (s) freq[s] = (freq[s] ?? 0) + 1 })
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([s]) => s)
}

function insightsFor(jobs: Job[], topN: number): SubAreaInsight[] {
  const grouped: Record<string, Job[]> = {}
  jobs.forEach((j) => {
    const key = j.sub_area?.trim() || "__none__"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(j)
  })

  return Object.entries(grouped)
    .filter(([key]) => key !== "__none__")
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, topN)
    .map(([subArea, grpJobs]) => ({
      subArea,
      count: grpJobs.length,
      locations: freqSort(grpJobs.flatMap((j) =>
        j.location ? [j.location.split(",")[0].trim()] : []
      )).slice(0, 2),
      tags: freqSort(grpJobs.flatMap((j) => j.tags ?? [])).slice(0, 3),
    }))
}

export function computeCompanyProfiles(data: JobsData): CompanyProfile[] {
  const { jobs, company_summaries } = data

  const byCompany: Record<string, Job[]> = {}
  jobs.forEach((job) => {
    if (!byCompany[job.company]) byCompany[job.company] = []
    byCompany[job.company].push(job)
  })

  const profiles = Object.entries(byCompany).map(([company, companyJobs]) => {
    const total = companyJobs.length

    const categoryBreakdown: Record<string, number> = {}
    companyJobs.forEach((job) => {
      const cat = job.category ?? "unclassified"
      categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1
    })

    const buildingJobs = companyJobs.filter(
      (j) => j.category === "engineering" || j.category === "research"
    )
    const sellingJobs = companyJobs.filter((j) => j.category === "sales_gtm")

    return {
      company,
      total,
      categoryBreakdown,
      buildingInsights: insightsFor(buildingJobs, 5),
      sellingInsights: insightsFor(sellingJobs, 4),
      llmSummary: company_summaries?.[company],
    }
  })

  return profiles.sort((a, b) => {
    const ai = PINNED.indexOf(a.company)
    const bi = PINNED.indexOf(b.company)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return b.total - a.total
  })
}
