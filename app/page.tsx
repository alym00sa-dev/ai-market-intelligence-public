import fs from "fs"
import path from "path"
import type { JobsData } from "./types"
import Navbar from "./components/Navbar"
import HiringView from "./components/HiringView"
import { computeCompanyProfiles } from "./lib/profiles"

function loadJobs(): JobsData {
  const filePath = path.join(process.cwd(), "public", "data", "jobs.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as JobsData
  } catch {
    return { scraped_at: null, total_jobs: 0, companies: {}, jobs: [] }
  }
}

export default function Page() {
  const data = loadJobs()
  const companies = Object.keys(data.companies).sort()

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

  // Strip descriptions — only used during classification, not in the UI (~13 MB saved)
  data.jobs.forEach((j) => { delete (j as Record<string, unknown>).description })

  const profiles = computeCompanyProfiles(data)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      {data.total_jobs === 0 ? (
        <div className="flex-1 px-4 sm:px-6 py-8">
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
            <p className="text-slate-600 font-medium">No data yet.</p>
            <p className="text-sm text-slate-400 mt-1">Run the scraper to populate this dashboard:</p>
            <code className="inline-block mt-3 px-4 py-2 bg-slate-100 rounded-lg text-sm text-slate-600 font-mono">
              cd frontier-labs-hiring && python scraper.py
            </code>
          </div>
        </div>
      ) : (
        <HiringView
          totalJobs={data.total_jobs}
          companyCount={Object.keys(data.companies).length}
          jobs={data.jobs}
          profiles={profiles}
          companies={companies}
          scrapedAt={scraped}
        />
      )}
    </div>
  )
}
