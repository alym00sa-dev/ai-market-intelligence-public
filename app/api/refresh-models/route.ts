import { NextResponse } from "next/server"

const REPO   = "alym00sa-dev/ai-market-intelligence-public"
const WORKFLOW = "refresh-models.yml"
const GH_API = "https://api.github.com"

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }
}

// GET — return status of the most recent workflow run
export async function GET() {
  if (!process.env.GITHUB_PAT) {
    return NextResponse.json({ state: "error", error: "GITHUB_PAT not configured", log: [], started_at: null, finished_at: null })
  }

  const res = await fetch(
    `${GH_API}/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`,
    { headers: ghHeaders() }
  )
  if (!res.ok) {
    return NextResponse.json({ state: "error", error: `GitHub API error: ${res.status}`, log: [], started_at: null, finished_at: null })
  }

  const data = await res.json()
  const run = data.workflow_runs?.[0]
  if (!run) {
    return NextResponse.json({ state: "idle", log: [], started_at: null, finished_at: null, error: null })
  }

  // Map GitHub run status → our RefreshStatus shape
  const ghToState = () => {
    if (run.status === "completed") {
      return run.conclusion === "success" ? "done" : "error"
    }
    if (run.status === "in_progress" || run.status === "queued" || run.status === "waiting") {
      return "running"
    }
    return "idle"
  }

  return NextResponse.json({
    state: ghToState(),
    started_at: run.created_at,
    finished_at: run.updated_at,
    log: [
      `Run #${run.run_number} — ${run.status}${run.conclusion ? ` (${run.conclusion})` : ""}`,
      `View on GitHub: ${run.html_url}`,
    ],
    error: run.conclusion === "failure" ? `Run failed. See logs: ${run.html_url}` : null,
  })
}

// POST — dispatch the workflow
export async function POST() {
  if (!process.env.GITHUB_PAT) {
    return NextResponse.json({ error: "GITHUB_PAT not configured on server" }, { status: 500 })
  }

  const current = await GET()
  const currentData = await current.json()
  if (currentData.state === "running") {
    return NextResponse.json({ error: "Refresh already in progress" }, { status: 409 })
  }

  const res = await fetch(
    `${GH_API}/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({ ref: "main" }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Failed to trigger workflow: ${text}` }, { status: 500 })
  }

  return NextResponse.json({ message: "Refresh started", started_at: new Date().toISOString() })
}
