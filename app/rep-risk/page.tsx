import fs from "fs"
import path from "path"
import Navbar from "../components/Navbar"
import RepRiskView from "../components/RepRiskView"
import type { RepRiskData } from "../types"

function loadRepRisk(): RepRiskData | null {
  const filePath = path.join(process.cwd(), "public", "data", "rep-risk.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as RepRiskData
  } catch {
    return null
  }
}

export default function RepRiskPage() {
  const data = loadRepRisk()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 px-4 sm:px-6 py-8">
        {!data ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
            <p className="text-slate-600 font-medium">No rep-risk data yet.</p>
            <p className="text-sm text-slate-400 mt-1">Run the pipeline to populate this view.</p>
          </div>
        ) : (
          <RepRiskView data={data} />
        )}
      </div>
    </div>
  )
}
