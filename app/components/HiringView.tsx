"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import CompanyProfiles from "./CompanyProfiles"
import CompanyComparison from "./CompanyComparison"
import StatsBar from "./StatsBar"
import JobsTable from "./JobsTable"
import type { CompanyProfile, CompanyChange, Job } from "../types"

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
  changes,
  scrapedAt,
}: {
  totalJobs: number
  companyCount: number
  jobs: Job[]
  profiles: CompanyProfile[]
  changes: Record<string, CompanyChange>
  scrapedAt: string | null
}) {
  const [tab, setTab] = useState<Tab>("profiles")

  if (totalJobs === 0) return null

  return (
    <div className="flex flex-1 min-h-0">
      {/* Main content */}
      <div className="flex-1 min-w-0 px-4 sm:px-6 py-4 overflow-y-auto">

        {/* Header — always visible */}
        <div className="mb-6">
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              color: "var(--text-primary)",
              lineHeight: 1.15,
            }}
          >
            Frontier Hiring
          </h1>
          <div className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
            <span
              className="tabular-nums font-mono"
              style={{ color: "var(--text-primary)", fontWeight: 500 }}
            >
              {companyCount}
            </span>
            {" companies tracked · "}
            <span
              className="tabular-nums font-mono"
              style={{ color: "var(--text-primary)", fontWeight: 500 }}
            >
              {totalJobs.toLocaleString()}
            </span>
            {" open roles"}
          </div>
          {scrapedAt && (
            <div
              className="text-[11px] mt-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              Last updated {scrapedAt}
            </div>
          )}
        </div>

        {/* Tab bar — always visible */}
        <div
          className="flex items-end gap-0 mb-6"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px"
                style={{
                  borderBottom: `2px solid ${active ? "var(--accent-blue)" : "transparent"}`,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {t.label}
              </button>
            )
          })}
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
          <div
            className="rounded-xl overflow-hidden"
            style={{
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
          >
            <HiringMap jobs={jobs} />
          </div>
        )}

        {tab === "compare" && <CompanyComparison profiles={profiles} jobs={jobs} changes={changes} />}

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
