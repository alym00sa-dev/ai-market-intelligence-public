import fs from "fs"
import path from "path"
import type { ModelsData } from "../../types"
import Navbar from "../../components/Navbar"
import FullLeaderboard from "../../components/FullLeaderboard"

function loadModels(): ModelsData | null {
  const filePath = path.join(process.cwd(), "public", "data", "models.json")
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as ModelsData
  } catch {
    return null
  }
}

export default function LeaderboardPage() {
  const data = loadModels()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 px-4 sm:px-6 py-8">
        <div className="w-full space-y-5">
          <div className="flex items-center gap-3">
            <a href="/models" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              ← Frontier Model Tracking
            </a>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Full Model Leaderboard</h1>
            {data && (
              <p className="text-sm text-slate-400 mt-0.5">{data.model_count} models · sortable by any column</p>
            )}
          </div>
          {!data ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
              <p className="text-slate-500">No model data available. Run the data pipeline first.</p>
            </div>
          ) : (
            <FullLeaderboard models={data.models} />
          )}
        </div>
      </div>
    </div>
  )
}
