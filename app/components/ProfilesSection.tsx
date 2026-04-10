"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import CompanyProfiles from "./CompanyProfiles"
import type { CompanyProfile } from "../types"
import type { Job } from "../types"

const HiringMap = dynamic(() => import("./HiringMap"), { ssr: false })

type Tab = "profiles" | "map"

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
      {/* Section header with tabs */}
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={() => setTab("profiles")}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
            tab === "profiles"
              ? "bg-slate-800 text-white"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          Company Profiles
        </button>
        <button
          onClick={() => setTab("map")}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
            tab === "map"
              ? "bg-slate-800 text-white"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          Hiring Map
        </button>
        <span className="ml-2 text-[11px] text-slate-400">
          {profiles.length} companies
        </span>
      </div>

      {tab === "profiles" && <CompanyProfiles profiles={profiles} />}
      {tab === "map" && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-6 py-5">
          <HiringMap jobs={jobs} />
        </div>
      )}
    </div>
  )
}
