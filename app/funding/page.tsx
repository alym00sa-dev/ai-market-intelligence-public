import fs from "fs"
import path from "path"
import FundingFlowView from "../components/FundingFlowView"
import type { FundingData } from "../types"

function loadFunding(): FundingData | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "funding.json"), "utf-8")) as FundingData
  } catch {
    return null
  }
}

export default function FundingPage() {
  const data = loadFunding()
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 px-4 sm:px-6 py-4">
        {!data ? (
          <div className="rounded-xl px-6 py-12 text-center" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-subtle)" }}>
            <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>No funding data yet.</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>Run the funding-flows pipeline to populate this view.</p>
          </div>
        ) : <FundingFlowView data={data} />}
      </div>
    </div>
  )
}
