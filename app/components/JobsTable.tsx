"use client"

import { Fragment, useState, useMemo } from "react"
import type { Job, JobCategory } from "../types"
import { StatusPill, type PillTone } from "./ds"

const CATEGORY_LABELS: Record<string, string> = {
  engineering: "Engineering",
  sales_gtm: "Sales / GTM",
  research: "Research",
  operations: "Operations",
  other: "Other",
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

const DISPLAY_NAMES: Record<string, string> = {
  "Amazon AGI":         "Amazon",
  "Microsoft Research": "Microsoft",
  "Google DeepMind":    "Google",
}

const VERTICAL_LABELS: Record<string, string> = {
  health_rd:       "Health R&D",
  health_delivery: "Health Delivery",
  agriculture:     "Agriculture",
  education:       "Education",
}

function exportCSV(jobs: Job[]) {
  const headers = ["Company", "Title", "Category", "Focus Area", "Location", "Vertical", "Social Impact", "URL"]
  const rows = jobs.map((j) => [
    j.company,
    j.title,
    CATEGORY_LABELS[j.category ?? "unclassified"] ?? (j.category ?? ""),
    j.sub_area ?? "",
    j.location ?? "",
    VERTICAL_LABELS[j.vertical ?? ""] ?? "",
    j.social_impact ? "Yes" : "",
    j.url ?? "",
  ])
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "hiring-data.csv"
  a.click()
  URL.revokeObjectURL(url)
}

type Props = {
  jobs: Job[]
}

export default function JobsTable({ jobs }: Props) {
  const [search, setSearch] = useState("")
  const [filterCompany, setFilterCompany] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [filterVertical, setFilterVertical] = useState("all")
  const [filterSocial, setFilterSocial] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const companies = useMemo(() => {
    const seen = new Set<string>()
    jobs.forEach((j) => seen.add(j.company))
    return Array.from(seen).sort()
  }, [jobs])

  const categories = useMemo(() => {
    const seen = new Set<string>()
    jobs.forEach((j) => seen.add(j.category ?? "unclassified"))
    return Array.from(seen).sort()
  }, [jobs])

  const verticals = useMemo(() => {
    const seen = new Set<string>()
    jobs.forEach((j) => { if (j.vertical) seen.add(j.vertical) })
    return Array.from(seen).sort()
  }, [jobs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return jobs.filter((job) => {
      if (filterCompany !== "all" && job.company !== filterCompany) return false
      if (filterCategory !== "all" && (job.category ?? "unclassified") !== filterCategory) return false
      if (filterVertical !== "all" && (job.vertical ?? "") !== filterVertical) return false
      if (filterSocial === "yes" && !job.social_impact) return false
      if (q && !job.title.toLowerCase().includes(q) && !job.sub_area?.toLowerCase().includes(q) && !job.what?.toLowerCase().includes(q)) return false
      return true
    })
  }, [jobs, filterCompany, filterCategory, filterVertical, filterSocial, search])

  return (
    <div className="space-y-4">
      {/* Filters + export */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search roles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-md focus:outline-none"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        />
        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="px-3 py-2 text-sm rounded-md focus:outline-none"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          <option value="all">All Companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>{DISPLAY_NAMES[c] ?? c}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 text-sm rounded-md focus:outline-none"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
          ))}
        </select>
        {verticals.length > 0 && (
          <select
            value={filterVertical}
            onChange={(e) => setFilterVertical(e.target.value)}
            className="px-3 py-2 text-sm rounded-md focus:outline-none"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
          >
            <option value="all">All Verticals</option>
            {verticals.map((v) => (
              <option key={v} value={v}>{VERTICAL_LABELS[v] ?? v}</option>
            ))}
          </select>
        )}
        <select
          value={filterSocial}
          onChange={(e) => setFilterSocial(e.target.value)}
          className="px-3 py-2 text-sm rounded-md focus:outline-none"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          <option value="all">All Roles</option>
          <option value="yes">Social Impact Only</option>
        </select>
        <span
          className="self-center text-sm whitespace-nowrap font-mono tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {filtered.length.toLocaleString()} roles
        </span>
        <button
          onClick={() => exportCSV(filtered)}
          className="px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap"
          style={{
            color: "var(--text-secondary)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden max-h-[560px] overflow-y-auto"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <table
          className="w-full text-sm"
          style={{
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            borderCollapse: "collapse",
          }}
        >
          <thead
            className="sticky top-0 z-10"
            style={{
              background: "var(--bg-elevated)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <tr>
              {[
                ["Company",    "14%"],
                ["Role",       "24%"],
                ["Category",   "11%"],
                ["Focus Area", "13%"],
                ["Location",   "12%"],
                ["Vertical",   "11%"],
                ["Social",     "7%"],
                ["",           "8%"],
              ].map(([label, w], i) => (
                <th
                  key={i}
                  className="text-left px-4 py-3"
                  style={{
                    width: w,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-secondary)",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  No roles found.
                </td>
              </tr>
            )}
            {filtered.map((job) => {
              const cat = job.category ?? "unclassified"
              const isExpanded = expandedId === job.id
              const cellStyle = {
                padding: "11px 14px",
                borderBottom: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
              } as const
              return (
                <Fragment key={job.id}>
                  <tr
                    key={job.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--bg-elevated)]"
                    onClick={() => setExpandedId(isExpanded ? null : job.id)}
                  >
                    <td style={{ ...cellStyle, fontWeight: 500 }}>
                      {DISPLAY_NAMES[job.company] ?? job.company}
                    </td>
                    <td style={cellStyle}>{job.title}</td>
                    <td style={cellStyle}>
                      <StatusPill tone={CATEGORY_TONE[cat] ?? "muted"}>
                        {CATEGORY_LABELS[cat] ?? cat}
                      </StatusPill>
                    </td>
                    <td
                      className="text-xs"
                      style={{ ...cellStyle, color: "var(--text-secondary)" }}
                    >
                      {job.sub_area ?? "—"}
                    </td>
                    <td
                      className="text-xs"
                      style={{ ...cellStyle, color: "var(--text-secondary)" }}
                    >
                      {job.location || "—"}
                    </td>
                    <td style={cellStyle}>
                      {job.vertical ? (
                        <StatusPill tone="amber">
                          {VERTICAL_LABELS[job.vertical] ?? job.vertical}
                        </StatusPill>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }} className="text-xs">—</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {job.social_impact ? (
                        <StatusPill tone="green">Yes</StatusPill>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }} className="text-xs">—</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs hover:underline"
                          style={{ color: "var(--accent-blue)" }}
                        >
                          View →
                        </a>
                      )}
                    </td>
                  </tr>
                  {isExpanded && job.what && (
                    <tr
                      key={`${job.id}-expanded`}
                      style={{ background: "var(--accent-blue-bg)" }}
                    >
                      <td colSpan={8} className="px-4 py-3">
                        <p
                          className="text-sm mb-2"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {job.what}
                        </p>
                        {job.tags && job.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {job.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded text-xs"
                                style={{
                                  background: "var(--bg-surface)",
                                  border: "1px solid var(--border-subtle)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
