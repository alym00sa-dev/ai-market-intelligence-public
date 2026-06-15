import fs from "fs"
import path from "path"
import type { ModelsData } from "../types"
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
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 px-4 sm:px-6 py-4">
        {!data ? (
          <div
            className="rounded-xl px-6 py-12 text-center"
            style={{
              background: "var(--bg-surface)",
              border: "1px dashed var(--border-subtle)",
            }}
          >
            <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>No model data yet.</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
              Run the data pipeline to populate this view:
            </p>
            <code
              className="inline-block mt-3 px-4 py-2 rounded-lg text-sm font-mono"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
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
