import fs from "fs"
import path from "path"
import type { JobsData } from "./types"
import JobsTable from "./components/JobsTable"
import StatsBar from "./components/StatsBar"
import Navbar from "./components/Navbar"
import ProfilesSection from "./components/ProfilesSection"
import ChatPanel from "./components/ChatPanel"
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

  const profiles = computeCompanyProfiles(data)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar scrapedAt={scraped} />

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 sm:px-6 py-8 space-y-8 overflow-y-auto">

          {/* Empty state */}
          {data.total_jobs === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
              <p className="text-slate-600 font-medium">No data yet.</p>
              <p className="text-sm text-slate-400 mt-1">
                Run the scraper to populate this dashboard:
              </p>
              <code className="inline-block mt-3 px-4 py-2 bg-slate-100 rounded-lg text-sm text-slate-600 font-mono">
                cd frontier-labs-hiring && python scraper.py
              </code>
            </div>
          )}

          {/* Stats bar — title + breakdown + metrics */}
          {data.total_jobs > 0 && (
            <StatsBar
              totalJobs={data.total_jobs}
              companyCount={Object.keys(data.companies).length}
              jobs={data.jobs}
              scrapedAt={scraped}
            />
          )}

          {/* Company profiles + hiring map */}
          {data.total_jobs > 0 && <ProfilesSection profiles={profiles} jobs={data.jobs} />}

          {/* Jobs table */}
          {data.total_jobs > 0 && (
            <JobsTable jobs={data.jobs} companies={companies} />
          )}

        </div>

        {/* Chat sidebar */}
        <div className="hidden lg:flex w-[360px] shrink-0 px-4 py-8 sticky top-14 h-[calc(100vh-3.5rem)]">
          <ChatPanel availableCompanies={companies} />
        </div>
      </div>
    </div>
  )
}
