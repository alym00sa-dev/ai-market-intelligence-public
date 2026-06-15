import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import type { JobsData } from "../../types"
import { toSlug, fromSlug } from "../../lib/slug"
import { computeCompanyDetail } from "../../lib/company-detail"
import CompanyDetailView from "../../components/CompanyDetailView"

function loadJobs(): JobsData {
  const filePath = path.join(process.cwd(), "public", "data", "jobs.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as JobsData
  } catch {
    return { scraped_at: null, total_jobs: 0, companies: {}, jobs: [] }
  }
}

export async function generateStaticParams() {
  const data = loadJobs()
  return Object.keys(data.companies).map((name) => ({ slug: toSlug(name) }))
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = loadJobs()

  const companyNames = Object.keys(data.companies)
  const company = fromSlug(slug, companyNames)
  if (!company) notFound()

  // Strip descriptions — not shown in UI, saves significant payload per page
  data.jobs.forEach((j) => { delete (j as Record<string, unknown>).description })

  const detail = computeCompanyDetail(data, company)
  if (!detail) notFound()

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <CompanyDetailView detail={detail} />
      </div>
    </div>
  )
}
