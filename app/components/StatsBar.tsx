import type { Job } from "../types"
import { SectionLabel, StatusPill, type PillTone } from "./ds"

const CATEGORY_LABELS: Record<string, string> = {
  engineering:  "Engineering",
  sales_gtm:    "Sales / GTM",
  research:     "Research",
  operations:   "Operations",
  other:        "Other",
  unclassified: "Unclassified",
}

const CATEGORY_TONE: Record<string, PillTone> = {
  engineering:  "blue",
  research:     "amber",
  sales_gtm:    "green",
  operations:   "muted",
  other:        "muted",
  unclassified: "muted",
}

const CATEGORY_COLOR: Record<string, string> = {
  engineering:  "var(--accent-blue)",
  research:     "var(--accent-amber)",
  sales_gtm:    "var(--accent-green)",
  operations:   "#6B5BC9",                // muted indigo — distinct from Other
  other:        "#BCC4D2",                // light slate
  unclassified: "var(--border-subtle)",
}

const CATEGORY_ORDER = ["engineering", "research", "sales_gtm", "operations", "other", "unclassified"]

const DISPLAY_NAMES: Record<string, string> = {
  "Amazon AGI":         "Amazon",
  "Microsoft Research": "Microsoft",
  "Google DeepMind":    "Google",
}

// Brand-aligned company colors. Used to tint leader cards so it reads
// at-a-glance who's winning each bucket.
const COMPANY_COLOR: Record<string, string> = {
  "Anthropic":     "#D97757",
  "OpenAI":        "#10A37F",
  "Google":        "#4285F4",
  "xAI":           "#1F1F1F",
  "Meta":          "#1877F2",
  "Microsoft":     "#00A4EF",
  "Amazon":        "#FF9900",
  "NVIDIA":        "#76B900",
  "Mistral AI":    "#FF6B35",
  "Cohere":        "#39594D",
  "Inflection AI": "#06B6D4",
  "Stability AI":  "#A855F7",
  "Moonshot AI":   "#EF4444",
  "ByteDance":     "#F43F5E",
}

function displayName(raw: string): string {
  return DISPLAY_NAMES[raw] ?? raw
}

function companyColor(name: string): string {
  return COMPANY_COLOR[name] ?? "var(--accent-blue)"
}

// Add alpha to a hex color → rgba string. Falls back to css var unchanged.
function tint(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

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

type Props = {
  totalJobs: number
  companyCount: number
  jobs: Job[]
  scrapedAt?: string | null
}

export default function StatsBar({ totalJobs, jobs }: Props) {
  const byCategory: Record<string, number> = {}
  jobs.forEach((job) => {
    const cat = job.category ?? "unclassified"
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
  })

  const active = CATEGORY_ORDER.filter((c) => (byCategory[c] ?? 0) > 0)
  const leaders = computeLeaders(jobs).filter((b) => b.hasData)

  return (
    <div className="space-y-8 py-2">

      {/* Category breakdown — centered, no card */}
      <div className="flex flex-col items-center gap-3">
        <SectionLabel className="text-center">Hiring Breakdown</SectionLabel>

        <div className="flex rounded-full overflow-hidden h-2 w-full max-w-[1400px]">
          {active.map((cat) => (
            <div
              key={cat}
              title={`${CATEGORY_LABELS[cat]}: ${byCategory[cat]}`}
              style={{
                background: CATEGORY_COLOR[cat],
                width: `${(byCategory[cat] / totalJobs) * 100}%`,
              }}
            />
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2 w-full max-w-[1400px]">
          {active.map((cat) => {
            const count = byCategory[cat]
            const pct = Math.round((count / totalJobs) * 100)
            return (
              <StatusPill key={cat} tone={CATEGORY_TONE[cat] ?? "muted"}>
                {CATEGORY_LABELS[cat] ?? cat}
                <span
                  className="font-mono"
                  style={{ marginLeft: 6, opacity: 0.7, letterSpacing: "0.02em" }}
                >
                  {pct}%
                </span>
              </StatusPill>
            )
          })}
        </div>
      </div>

      {leaders.length > 0 && (
        <div className="flex flex-col items-center gap-3">
          <SectionLabel className="text-center">Who&rsquo;s Leading the Charge</SectionLabel>
          <div
            className="grid gap-4 w-full max-w-[1400px]"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
          >
            {leaders.map(({ label, leader, count }) => {
              const color = companyColor(leader)
              return (
                <div
                  key={label}
                  className="flex flex-col gap-1 rounded-lg px-3 py-2.5"
                  style={{
                    background: tint(color, 0.10),
                    border: `1px solid ${tint(color, 0.25)}`,
                  }}
                >
                  <span
                    className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span
                      className="text-[13px] font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {leader}
                    </span>
                  </div>
                  <span
                    className="font-mono text-[18px] tabular-nums leading-none"
                    style={{ color, fontWeight: 600 }}
                  >
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
