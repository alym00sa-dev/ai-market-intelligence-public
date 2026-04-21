import fs from "fs"
import path from "path"
import { notFound } from "next/navigation"
import type { JobsData } from "../../types"
import { toSlug, fromSlug } from "../../lib/slug"
import { computeCompanyDetail } from "../../lib/company-detail"
import Navbar from "../../components/Navbar"
import CompanyDetailView from "../../components/CompanyDetailView"
import ChatPanel from "../../components/ChatPanel"

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

  const scraped = data.scraped_at
    ? new Date(data.scraped_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null

  const allCompanies = companyNames.sort()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar scrapedAt={scraped} />

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <CompanyDetailView detail={detail} />
        </div>

        {/* Chat sidebar */}
        <div className="hidden lg:flex w-[360px] shrink-0 px-4 py-8 sticky top-14 h-[calc(100vh-3.5rem)]">
          <ChatPanel availableCompanies={allCompanies} defaultCompany={company} />
        </div>
      </div>
    </div>
  )
}
