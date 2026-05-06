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

const DISPLAY_NAMES: Record<string, string> = {
  "Amazon AGI":         "Amazon",
  "Microsoft Research": "Microsoft",
  "Google DeepMind":    "Google",
}

const COMPANY_COLORS: Record<string, string> = {
  "Anthropic":     "#6366f1",
  "OpenAI":        "#10b981",
  "Google":        "#3b82f6",
  "xAI":           "#f59e0b",
  "Mistral AI":    "#ec4899",
  "Cohere":        "#8b5cf6",
  "NVIDIA":        "#22c55e",
  "Amazon":        "#f97316",
  "Microsoft":     "#0ea5e9",
  "Inflection AI": "#06b6d4",
  "Stability AI":  "#a855f7",
  "Moonshot AI":   "#ef4444",
  "ByteDance":     "#f43f5e",
}

function displayName(raw: string): string {
  return DISPLAY_NAMES[raw] ?? raw
}

function companyColor(raw: string): string {
  return COMPANY_COLORS[displayName(raw)] ?? "#94a3b8"
}

// ── Who's Leading the Charge ──────────────────────────────────────────────────

type LeaderBucket = {
  label: string
  leader: string
  count: number
  hasData: boolean
}

function computeLeaders(jobs: Job[]): LeaderBucket[] {
  function topCompany(filter: (j: Job) => boolean): { leader: string; count: number } | null {
    const counts: Record<string, number> = {}
    for (const job of jobs) {
      if (!filter(job)) continue
      const name = displayName(job.company)
      counts[name] = (counts[name] ?? 0) + 1
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    if (!entries.length) return null
    return { leader: entries[0][0], count: entries[0][1] }
  }

  const buckets: { label: string; filter: (j: Job) => boolean }[] = [
    { label: "Building",        filter: (j) => j.category === "engineering" || j.category === "research" },
    { label: "Selling",         filter: (j) => j.category === "sales_gtm" },
    { label: "Health R&D",      filter: (j) => j.vertical === "health_rd" },
    { label: "Health Delivery", filter: (j) => j.vertical === "health_delivery" },
    { label: "Agriculture",     filter: (j) => j.vertical === "agriculture" },
    { label: "Education",       filter: (j) => j.vertical === "education" },
    { label: "Social Impact",   filter: (j) => j.social_impact === true },
  ]

  return buckets.map(({ label, filter }) => {
    const result = topCompany(filter)
    return result
      ? { label, leader: result.leader, count: result.count, hasData: true }
      : { label, leader: "", count: 0, hasData: false }
  })
}

// ── Main component ────────────────────────────────────────────────────────────

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

  const leaders = computeLeaders(jobs).filter((b) => b.hasData)

  return (
    <div>
      {/* Single dark card: breakdown bar + who's leading */}
      <div className="bg-slate-900 rounded-2xl px-6 py-5 space-y-5">
        {/* Breakdown bar */}
        <div>
          <div className="flex rounded-full overflow-hidden h-2 mb-3">
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
                  <span className="text-slate-400">{CATEGORY_LABELS[cat]}</span>
                  <span className="text-white font-medium tabular-nums">{pct}%</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400 tabular-nums">{byCategory[cat].toLocaleString()}</span>
                </span>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        {leaders.length > 0 && <div className="border-t border-white/10" />}

        {/* Who's leading the charge */}
        {leaders.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Who&rsquo;s leading the charge
            </p>
            <div className="flex gap-2.5">
              {leaders.map(({ label, leader, count }) => {
                const color = companyColor(leader)
                return (
                  <div
                    key={label}
                    className="flex-1 flex flex-col gap-2 rounded-xl px-4 py-3.5 border border-white/10 hover:border-white/20 transition-colors"
                    style={{ backgroundColor: `${color}18` }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[12px] font-semibold text-white truncate">{leader}</span>
                    </div>
                    <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
