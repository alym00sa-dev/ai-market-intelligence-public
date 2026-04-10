import type { Job } from "../types"

const CATEGORY_COLORS: Record<string, string> = {
  engineering:  "bg-blue-500",
  sales_gtm:    "bg-emerald-500",
  research:     "bg-violet-500",
  operations:   "bg-amber-400",
  other:        "bg-slate-300",
  unclassified: "bg-slate-200",
}

const CATEGORY_LABELS: Record<string, string> = {
  engineering:  "Engineering",
  sales_gtm:    "Sales / GTM",
  research:     "Research",
  operations:   "Operations",
  other:        "Other",
  unclassified: "Unclassified",
}

type Props = {
  totalJobs: number
  companyCount: number
  jobs: Job[]
  scrapedAt?: string | null
}

export default function StatsBar({ totalJobs, companyCount, jobs, scrapedAt }: Props) {
  const byCategory: Record<string, number> = {}
  jobs.forEach((job) => {
    const cat = job.category ?? "unclassified"
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
  })

  const categoryOrder = ["engineering", "research", "sales_gtm", "operations", "other", "unclassified"]
  const active = categoryOrder.filter((c) => byCategory[c] > 0)

  const buildingCount = (byCategory["engineering"] ?? 0) + (byCategory["research"] ?? 0)
  const sellingCount  = byCategory["sales_gtm"] ?? 0

  return (
    <div className="space-y-3">

      {/* Hero card: title + breakdown bar */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-6 py-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[17px] font-semibold text-slate-900 tracking-tight leading-snug">
              Frontier AI · Hiring Intelligence
            </h1>
            <p className="text-[13px] text-slate-400 mt-0.5">
              What the industry is actually building — from{" "}
              <span className="text-slate-600 font-medium tabular-nums">{totalJobs.toLocaleString()}</span> open roles
            </p>
          </div>
          {scrapedAt && (
            <span className="text-[11px] text-slate-300 shrink-0 ml-4 mt-0.5 tabular-nums">
              {scrapedAt}
            </span>
          )}
        </div>

        {/* Breakdown bar */}
        <div>
          <div className="flex rounded-full overflow-hidden h-2.5 mb-3">
            {active.map((cat) => (
              <div
                key={cat}
                className={CATEGORY_COLORS[cat] ?? "bg-slate-300"}
                style={{ width: `${(byCategory[cat] / totalJobs) * 100}%` }}
                title={`${CATEGORY_LABELS[cat]}: ${byCategory[cat]}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {active.map((cat) => {
              const pct = Math.round((byCategory[cat] / totalJobs) * 100)
              return (
                <span key={cat} className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className={`inline-block w-2 h-2 rounded-full ${CATEGORY_COLORS[cat] ?? "bg-slate-300"}`} />
                  <span className="text-slate-500">{CATEGORY_LABELS[cat]}</span>
                  <span className="text-slate-700 font-medium tabular-nums">{pct}%</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400 tabular-nums">{byCategory[cat].toLocaleString()}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Roles"
          value={totalJobs.toLocaleString()}
          accent="bg-slate-800"
        />
        <StatCard
          label="Companies Tracked"
          value={companyCount}
          accent="bg-indigo-500"
        />
        <StatCard
          label="Building Capacity"
          value={buildingCount.toLocaleString()}
          sub={`${Math.round((buildingCount / totalJobs) * 100)}% engineering + research`}
          accent="bg-blue-500"
        />
        <StatCard
          label="Go-to-Market"
          value={sellingCount.toLocaleString()}
          sub={`${Math.round((sellingCount / totalJobs) * 100)}% sales & GTM`}
          accent="bg-emerald-500"
        />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number | string
  sub?: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 py-4">
      {/* Colored top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${accent}`} />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1.5 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sub}</p>}
    </div>
  )
}
