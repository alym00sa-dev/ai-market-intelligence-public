"use client"

import { useState, useMemo } from "react"
import type { Job, JobCategory } from "../types"

const CATEGORY_LABELS: Record<string, string> = {
  engineering: "Engineering",
  sales_gtm: "Sales / GTM",
  research: "Research",
  operations: "Operations",
  other: "Other",
  unclassified: "Unclassified",
}

const CATEGORY_COLORS: Record<string, string> = {
  engineering: "bg-blue-100 text-blue-800",
  sales_gtm: "bg-green-100 text-green-800",
  research: "bg-purple-100 text-purple-800",
  operations: "bg-yellow-100 text-yellow-800",
  other: "bg-gray-100 text-gray-600",
  unclassified: "bg-gray-100 text-gray-400",
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
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Roles</option>
          <option value="yes">Social Impact Only</option>
        </select>
        <span className="self-center text-sm text-gray-500 whitespace-nowrap">
          {filtered.length.toLocaleString()} roles
        </span>
        <button
          onClick={() => exportCSV(filtered)}
          className="px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[14%]">Company</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[24%]">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[11%]">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[13%]">Focus Area</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[12%]">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[11%]">Vertical</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[7%]">Social</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[8%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  No roles found.
                </td>
              </tr>
            )}
            {filtered.map((job) => {
              const cat = job.category ?? "unclassified"
              const isExpanded = expandedId === job.id
              return (
                <>
                  <tr
                    key={job.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : job.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{job.company}</td>
                    <td className="px-4 py-3 text-gray-700">{job.title}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-500"}`}>
                        {CATEGORY_LABELS[cat] ?? cat}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{job.sub_area ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{job.location || "—"}</td>
                    <td className="px-4 py-3">
                      {job.vertical ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                          {VERTICAL_LABELS[job.vertical] ?? job.vertical}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {job.social_impact ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          View →
                        </a>
                      )}
                    </td>
                  </tr>
                  {isExpanded && job.what && (
                    <tr key={`${job.id}-expanded`} className="bg-blue-50">
                      <td colSpan={8} className="px-4 py-3">
                        <p className="text-sm text-gray-700 mb-2">{job.what}</p>
                        {job.tags && job.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {job.tags.map((tag) => (
                              <span key={tag} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
