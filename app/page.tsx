import fs from "fs"
import path from "path"
import type { JobsData, CompanyChange } from "./types"
import HiringView from "./components/HiringView"
import { computeCompanyProfiles } from "./lib/profiles"

// Render on-demand instead of statically prerendering. The jobs dataset (~17k rows)
// serializes well past Vercel's 19 MB ISR prerender cap when baked into a static page
// (it gets embedded in both the HTML and the RSC payload). Dynamic rendering streams it.
export const dynamic = "force-dynamic"

function loadJobs(): JobsData {
  const filePath = path.join(process.cwd(), "public", "data", "jobs.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as JobsData
  } catch {
    return { scraped_at: null, total_jobs: 0, companies: {}, jobs: [] }
  }
}

// Latest week's per-company new/removed counts from the change tracker.
// Empty until track_changes.py has run at least once (graceful "populate later").
function loadChanges(): Record<string, CompanyChange> {
  const filePath = path.join(process.cwd(), "public", "data", "weekly_trends.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const trends = JSON.parse(raw) as {
      weeks: { week: string; by_company: Record<string, { new?: number; removed?: number }> }[]
    }
    const weeks = trends.weeks ?? []
    if (weeks.length === 0) return {}
    const latest = weeks[weeks.length - 1]
    const out: Record<string, CompanyChange> = {}
    for (const [co, s] of Object.entries(latest.by_company ?? {})) {
      out[co] = { new: s.new ?? 0, removed: s.removed ?? 0 }
    }
    return out
  } catch {
    return {}
  }
}

export default function Page() {
  const data = loadJobs()

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

  // Strip fields the UI never reads — descriptions (used only for classification, ~33 MB)
  // plus the change-tracking bookkeeping — to keep the client payload lean.
  data.jobs.forEach((j) => {
    const r = j as Record<string, unknown>
    delete r.description; delete r.first_seen; delete r.last_seen; delete r.is_new
  })

  const profiles = computeCompanyProfiles(data)
  const changes = loadChanges()

  return (
    <div className="min-h-screen flex flex-col">
      {data.total_jobs === 0 ? (
        <div className="flex-1 px-4 sm:px-6 py-8">
          <div
            className="rounded-xl px-6 py-12 text-center"
            style={{
              background: "var(--bg-surface)",
              border: "1px dashed var(--border-subtle)",
            }}
          >
            <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>No data yet.</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
              Run the scraper to populate this dashboard:
            </p>
            <code
              className="inline-block mt-3 px-4 py-2 rounded-lg text-sm font-mono"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
              }}
            >
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
          changes={changes}
          scrapedAt={scraped}
        />
      )}
    </div>
  )
}
