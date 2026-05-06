import fs from "fs"
import path from "path"
import Navbar from "../components/Navbar"
import ComputeView from "../components/ComputeView"
import type { ComputeData } from "../types"

function loadCompute(): ComputeData | null {
  const filePath = path.join(process.cwd(), "public", "data", "compute.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as ComputeData
  } catch {
    return null
  }
}

export default function ComputePage() {
  const data = loadCompute()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 px-4 sm:px-6 py-8">
        {!data ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
            <p className="text-slate-600 font-medium">No compute data yet.</p>
            <p className="text-sm text-slate-400 mt-1">Run the data pipeline to populate this view:</p>
            <code className="inline-block mt-3 px-4 py-2 bg-slate-100 rounded-lg text-sm text-slate-600 font-mono">
              cd compute-datacenter-distro && python scraper/link.py && python scraper/normalize.py
            </code>
          </div>
        ) : (
          <ComputeView data={data} />
        )}
      </div>
    </div>
  )
}
