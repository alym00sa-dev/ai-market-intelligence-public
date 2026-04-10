import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import fs from "fs"
import path from "path"
import type { JobsData } from "../../types"

function loadJobs(): JobsData {
  const filePath = path.join(process.cwd(), "public", "data", "jobs.json")
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as JobsData
  } catch {
    return { scraped_at: null, total_jobs: 0, companies: {}, jobs: [] }
  }
}

function buildContext(data: JobsData, companies: string[]): string {
  const targets =
    companies.length === 0 || companies[0] === "all"
      ? Object.keys(data.companies)
      : companies.filter((c) => data.companies[c])

  // Index jobs by company up front
  const byCompany: Record<string, typeof data.jobs> = {}
  data.jobs
    .filter((j) => targets.includes(j.company))
    .forEach((j) => {
      byCompany[j.company] = byCompany[j.company] ?? []
      byCompany[j.company].push(j)
    })

  const lines: string[] = [
    "You are an AI market-intelligence analyst with access to real hiring data from frontier AI companies.",
    `Data scraped: ${data.scraped_at ? new Date(data.scraped_at).toDateString() : "recently"}.`,
    `Scope: ${targets.join(", ")}.`,
    "",
    "Answer questions about what these companies are building, selling, hiring for, and their geographic footprint.",
    "Be specific — cite role counts and draw meaningful insights. Keep answers concise and well-structured.",
    "Use markdown formatting where it helps readability (bullet points, bold, etc.).",
    "",
    "=== HIRING DATA ===",
  ]

  const fmt = (rec: Record<string, number>, n: number) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k.replace(/_/g, " ")} (${v})`)
      .join(", ")

  for (const company of targets) {
    const summary = data.companies[company]
    if (!summary) continue

    const llm = data.company_summaries?.[company]
    const jobs = byCompany[company] ?? []

    lines.push("", `### ${company} — ${summary.total} open roles`)

    const cats = Object.entries(summary.by_category)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c.replace(/_/g, " ")}: ${n} (${Math.round((n / summary.total) * 100)}%)`)
    lines.push(`Mix: ${cats.join(" | ")}`)

    if (llm?.building?.length) lines.push(`Building: ${llm.building.join(" · ")}`)
    if (llm?.selling?.length)  lines.push(`Selling: ${llm.selling.join(" · ")}`)

    const buildSA: Record<string, number> = {}
    const sellSA:  Record<string, number> = {}
    const locs:    Record<string, number> = {}

    jobs.forEach((j) => {
      if (j.sub_area) {
        if (j.category === "engineering" || j.category === "research")
          buildSA[j.sub_area] = (buildSA[j.sub_area] ?? 0) + 1
        else if (j.category === "sales_gtm")
          sellSA[j.sub_area] = (sellSA[j.sub_area] ?? 0) + 1
      }
      const city = j.location?.split(",")[0]?.trim()
      if (city) locs[city] = (locs[city] ?? 0) + 1
    })

    if (Object.keys(buildSA).length) lines.push(`Technical areas: ${fmt(buildSA, 8)}`)
    if (Object.keys(sellSA).length)  lines.push(`GTM areas: ${fmt(sellSA, 6)}`)
    if (Object.keys(locs).length)    lines.push(`Top locations: ${fmt(locs, 6)}`)
  }

  return lines.join("\n")
}

type ChatMessage = { role: "user" | "assistant"; content: string }

async function streamAnthropic(
  model: string,
  system: string,
  messages: ChatMessage[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
    stream: true,
  })
  for await (const event of response) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      controller.enqueue(encoder.encode(event.delta.text))
    }
  }
}

async function streamOpenAI(
  model: string,
  system: string,
  messages: ChatMessage[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const stream = await openai.chat.completions.create({
    model,
    // GPT-5.x uses max_completion_tokens; older models use max_tokens
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: system },
      ...messages,
    ],
    stream: true,
  })
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content
    if (text) controller.enqueue(encoder.encode(text))
  }
}

export async function POST(request: Request) {
  const { model, companies, messages } = await request.json()

  const isOpenAI = (model as string).startsWith("gpt-")

  if (isOpenAI && !process.env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY not configured", { status: 500 })
  }
  if (!isOpenAI && !process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 })
  }

  const data   = loadJobs()
  const system = buildContext(data, companies ?? [])
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (isOpenAI) {
          await streamOpenAI(model, system, messages, controller, encoder)
        } else {
          await streamAnthropic(model, system, messages, controller, encoder)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error"
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
