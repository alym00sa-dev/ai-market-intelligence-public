import fs from "fs"
import path from "path"
import type { ModelsData } from "../types"
import Navbar from "../components/Navbar"
import FrontierModels from "../components/FrontierModels"

function loadModels(): ModelsData | null {
  const filePath = path.join(process.cwd(), "public", "data", "models.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as ModelsData
  } catch {
    return null
  }
}

export default function ModelsPage() {
  const data = loadModels()

  const builtAt = data?.built_at
    ? new Date(data.built_at).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      })
    : null

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar scrapedAt={builtAt} />
      <div className="flex-1 px-4 sm:px-6 py-8">
        {!data ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
            <p className="text-slate-600 font-medium">No model data yet.</p>
            <p className="text-sm text-slate-400 mt-1">Run the data pipeline to populate this view:</p>
            <code className="inline-block mt-3 px-4 py-2 bg-slate-100 rounded-lg text-sm text-slate-600 font-mono">
              cd model-cap-benchmarks && python build_models_json.py
            </code>
          </div>
        ) : (
          <FrontierModels data={data} builtAt={builtAt} />
        )}
      </div>
    </div>
  )
}
