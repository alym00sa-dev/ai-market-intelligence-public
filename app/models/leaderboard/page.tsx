import fs from "fs"
import path from "path"
import type { ModelsData } from "../../types"
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
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 px-4 sm:px-6 py-4">
        <div className="w-full space-y-5">
          <div className="flex items-center gap-3">
            <a
              href="/models"
              className="text-sm transition-colors"
              style={{ color: "var(--text-tertiary)" }}
            >
              ← Model Benchmarks
            </a>
          </div>
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                color: "var(--text-primary)",
                lineHeight: 1.15,
              }}
            >
              Full Model Leaderboard
            </h1>
            {data && (
              <p
                className="text-sm mt-1 font-mono tabular-nums"
                style={{ color: "var(--text-tertiary)" }}
              >
                {data.model_count} models · sortable by any column
              </p>
            )}
          </div>
          {!data ? (
            <div
              className="rounded-xl px-6 py-12 text-center"
              style={{
                background: "var(--bg-surface)",
                border: "1px dashed var(--border-subtle)",
              }}
            >
              <p style={{ color: "var(--text-secondary)" }}>
                No model data available. Run the data pipeline first.
              </p>
            </div>
          ) : (
            <FullLeaderboard models={data.models} />
          )}
        </div>
      </div>
    </div>
  )
}
