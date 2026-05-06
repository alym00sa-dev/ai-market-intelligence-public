"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import CompanyProfiles from "./CompanyProfiles"
import CompanyComparison from "./CompanyComparison"
import StatsBar from "./StatsBar"
import JobsTable from "./JobsTable"
import type { CompanyProfile, Job } from "../types"

const HiringMap = dynamic(() => import("./HiringMap"), { ssr: false })

type Tab = "profiles" | "map" | "compare"

const TABS: { key: Tab; label: string }[] = [
  { key: "profiles", label: "Company Profiles" },
  { key: "map",      label: "Hiring Map"       },
  { key: "compare",  label: "Compare"          },
]

export default function HiringView({
  totalJobs,
  companyCount,
  jobs,
  profiles,
  scrapedAt,
}: {
  totalJobs: number
  companyCount: number
  jobs: Job[]
  profiles: CompanyProfile[]
  scrapedAt: string | null
}) {
  const [tab, setTab] = useState<Tab>("profiles")

  if (totalJobs === 0) return null

  return (
    <div className="flex flex-1 min-h-0">
      {/* Main content */}
      <div className="flex-1 min-w-0 px-4 sm:px-6 py-8 overflow-y-auto">

        {/* Header — always visible */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Frontier AI &middot; Hiring Intelligence
          </h1>
          <div className="flex items-center flex-wrap gap-2 text-xs text-slate-400 mt-1">
            <span>
              <span className="text-slate-600 font-medium tabular-nums">{companyCount} companies</span>
              {" "}tracked ·{" "}
              <span className="text-slate-600 font-medium tabular-nums">{totalJobs.toLocaleString()}</span>
              {" "}open roles
            </span>
            {scrapedAt && (
              <>
                <span className="text-slate-300">·</span>
                <span>Last updated {scrapedAt}</span>
              </>
            )}
          </div>
        </div>

        {/* Tab bar — always visible */}
        <div className="flex items-end gap-0 border-b border-slate-200 mb-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? "border-indigo-500 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Stats bar — profiles tab only */}
        {tab === "profiles" && (
          <div className="mb-8">
            <StatsBar
              totalJobs={totalJobs}
              companyCount={companyCount}
              jobs={jobs}
              scrapedAt={scrapedAt}
            />
          </div>
        )}

        {/* Tab content */}
        {tab === "profiles" && <CompanyProfiles profiles={profiles} />}

        {tab === "map" && (
          <div className="rounded-2xl overflow-hidden border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
            <HiringMap jobs={jobs} />
          </div>
        )}

        {tab === "compare" && <CompanyComparison profiles={profiles} jobs={jobs} />}

        {/* Jobs table — profiles tab only */}
        {tab === "profiles" && (
          <div className="mt-8">
            <JobsTable jobs={jobs} />
          </div>
        )}

      </div>
    </div>
  )
}
