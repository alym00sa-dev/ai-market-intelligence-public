"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import CompanyProfiles from "./CompanyProfiles"
import CompanyComparison from "./CompanyComparison"
import type { CompanyProfile } from "../types"
import type { Job } from "../types"

const HiringMap = dynamic(() => import("./HiringMap"), { ssr: false })

type Tab = "profiles" | "map" | "compare"

const TABS: { key: Tab; label: string }[] = [
  { key: "profiles", label: "Company Profiles" },
  { key: "map",      label: "Hiring Map"       },
  { key: "compare",  label: "Compare"          },
]

export default function ProfilesSection({
  profiles,
  jobs,
}: {
  profiles: CompanyProfile[]
  jobs: Job[]
}) {
  const [tab, setTab] = useState<Tab>("profiles")

  return (
    <div>
      {/* Underline tab bar */}
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
        <span className="ml-auto pb-2.5 text-[11px] text-slate-400 tabular-nums">
          {profiles.length} companies
        </span>
      </div>

      {tab === "profiles" && <CompanyProfiles profiles={profiles} />}

      {tab === "map" && (
        <div className="rounded-2xl overflow-hidden border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <HiringMap jobs={jobs} />
        </div>
      )}

      {tab === "compare" && <CompanyComparison profiles={profiles} jobs={jobs} />}
    </div>
  )
}
