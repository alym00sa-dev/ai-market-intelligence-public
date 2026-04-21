import { NextResponse } from "next/server"
import { spawn } from "child_process"
import fs from "fs"
import path from "path"

const STATUS_FILE = path.join(process.cwd(), "public", "data", "models_refresh_status.json")
const BENCHMARKS_DIR = path.join(process.cwd(), "..", "model-cap-benchmarks")

type RefreshStatus = {
  state: "idle" | "running" | "done" | "error"
  started_at: string | null
  finished_at: string | null
  log: string[]
  error: string | null
}

function readStatus(): RefreshStatus {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"))
  } catch {
    return { state: "idle", started_at: null, finished_at: null, log: [], error: null }
  }
}

function writeStatus(s: RefreshStatus) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(s, null, 2))
}

// GET — return current refresh status
export async function GET() {
  return NextResponse.json(readStatus())
}

// POST — trigger background refresh
export async function POST() {
  const current = readStatus()
  if (current.state === "running") {
    return NextResponse.json({ error: "Refresh already in progress" }, { status: 409 })
  }

  const status: RefreshStatus = {
    state: "running",
    started_at: new Date().toISOString(),
    finished_at: null,
    log: ["Starting refresh..."],
    error: null,
  }
  writeStatus(status)

  // Run in background — don't await
  runRefresh(status)

  return NextResponse.json({ message: "Refresh started", started_at: status.started_at })
}

async function runRefresh(status: RefreshStatus) {
  const log = (msg: string) => {
    status.log.push(msg)
    writeStatus(status)
  }

  try {
    // Step 1: delete existing data files to force re-fetch
    log("Clearing cached data files...")
    const aaDataDir = path.join(BENCHMARKS_DIR, "artificial-analysis", "data")
    const lsDataDir = path.join(BENCHMARKS_DIR, "llm-stats", "data")
    for (const dir of [aaDataDir, lsDataDir]) {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .forEach((f) => fs.unlinkSync(path.join(dir, f)))
      }
    }

    // Step 2: fetch Artificial Analysis
    log("Fetching Artificial Analysis data...")
    await runScript("python3", [path.join(BENCHMARKS_DIR, "artificial-analysis", "fetch.py")], log)

    // Step 3: fetch LLM Stats
    log("Fetching LLM Stats data...")
    await runScript("python3", [path.join(BENCHMARKS_DIR, "llm-stats", "fetch.py")], log)

    // Step 4: rebuild models.json
    log("Building merged models.json...")
    await runScript("python3", [path.join(BENCHMARKS_DIR, "build_models_json.py")], log)

    status.state = "done"
    status.finished_at = new Date().toISOString()
    log("Refresh complete.")
  } catch (err) {
    status.state = "error"
    status.finished_at = new Date().toISOString()
    status.error = String(err)
    log(`Error: ${err}`)
  }

  writeStatus(status)
}

function runScript(cmd: string, args: string[], log: (msg: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: BENCHMARKS_DIR })
    proc.stdout.on("data", (d: Buffer) => log(d.toString().trim()))
    proc.stderr.on("data", (d: Buffer) => log(`[stderr] ${d.toString().trim()}`))
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`))
    })
  })
}
