import fs from "fs"
import path from "path"
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
            <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              No safety data yet.
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
              Run the pipeline to populate this view.
            </p>
          </div>
        ) : (
          <RepRiskView data={data} />
        )}
      </div>
    </div>
  )
}
