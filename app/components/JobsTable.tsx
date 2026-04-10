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

type Props = {
  jobs: Job[]
  companies: string[]
}

export default function JobsTable({ jobs, companies }: Props) {
  const [search, setSearch] = useState("")
  const [filterCompany, setFilterCompany] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const seen = new Set<string>()
    jobs.forEach((j) => seen.add(j.category ?? "unclassified"))
    return Array.from(seen).sort()
  }, [jobs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return jobs.filter((job) => {
      if (filterCompany !== "all" && job.company !== filterCompany) return false
      if (filterCategory !== "all" && (job.category ?? "unclassified") !== filterCategory) return false
      if (q && !job.title.toLowerCase().includes(q) && !job.sub_area?.toLowerCase().includes(q) && !job.what?.toLowerCase().includes(q)) return false
      return true
    })
  }, [jobs, filterCompany, filterCategory, search])

  return (
    <div className="space-y-4">
      {/* Filters */}
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
        <span className="self-center text-sm text-gray-500 whitespace-nowrap">
          {filtered.length.toLocaleString()} roles
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[18%]">Company</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[28%]">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[12%]">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[16%]">Focus Area</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[14%]">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[12%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
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
                      <td colSpan={6} className="px-4 py-3">
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
