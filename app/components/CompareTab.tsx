"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import type { ModelRecord, ModelsData, SpeechData } from "../types"
import { CostScatter, SpeedVsIntelligence, orgColor, truncate } from "./models/charts"
import { DownloadableNode } from "./ds/DownloadableNode"

// ── Metric config ─────────────────────────────────────────────────────────────

type Metric = { key: keyof ModelRecord; label: string; short: string; hi: boolean; dec: number }

const BENCH: Metric[] = [
  { key: "intelligence_index", label: "Intelligence Index", short: "Intelligence", hi: true, dec: 1 },
  { key: "coding_index",       label: "Coding Index",       short: "Coding",  hi: true, dec: 1 },
  { key: "math_index",         label: "Math Index",         short: "Math",  hi: true, dec: 1 },
  { key: "gpqa",               label: "GPQA",               short: "GPQA",  hi: true, dec: 1 },
  { key: "hle",                label: "Humanity's Last Exam", short: "HLE", hi: true, dec: 1 },
  { key: "mmlu_pro",           label: "MMLU-Pro",           short: "MMLU-Pro",  hi: true, dec: 1 },
  { key: "livecodebench",      label: "LiveCodeBench",      short: "LiveCodeBench",   hi: true, dec: 1 },
  { key: "ifbench",            label: "IFBench",            short: "IFBench",    hi: true, dec: 1 },
  { key: "aime_25",            label: "AIME 2025",          short: "AIME 2025",  hi: true, dec: 1 },
]
const RADAR_METRICS: Metric[] = [
  BENCH[0], BENCH[1], BENCH[2], BENCH[3],
  { key: "price_blended",  label: "Price ($/M)",   short: "Price", hi: false, dec: 2 },
  { key: "tokens_per_sec", label: "Speed (tok/s)", short: "Speed", hi: true,  dec: 0 },
]

const ENTITY_COLORS = ["#2C4D9E", "#C77F2E"] // focal, rival

const num = (m: ModelRecord, k: keyof ModelRecord): number | null => (m[k] as number | null) ?? null
const fmt = (n: number | null, dec: number) => (n == null ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }))
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

function rankOf(models: ModelRecord[], k: keyof ModelRecord, hi: boolean, v: number | null): number | null {
  if (v == null) return null
  const xs = models.map((m) => num(m, k)).filter((x): x is number => x != null)
  return xs.filter((x) => (hi ? x > v : x < v)).length + 1
}
// % of the field this value is STRICTLY better than (0 = worst, 100 = best). Ties are
// not counted as "beaten" — so the field minimum correctly beats 0%.
function beatsPct(models: ModelRecord[], k: keyof ModelRecord, hi: boolean, v: number | null): number | null {
  if (v == null) return null
  const xs = models.map((m) => num(m, k)).filter((x): x is number => x != null)
  if (xs.length <= 1) return null
  const better = xs.filter((x) => (hi ? x < v : x > v)).length
  return Math.round((better / (xs.length - 1)) * 100)
}

// ── Entity model ──────────────────────────────────────────────────────────────

type EntityKind = "model" | "company"
type EntityRef = { kind: EntityKind; id: string }
type ResolvedEntity = { kind: EntityKind; label: string; sublabel: string; color: string; models: ModelRecord[]; best: ModelRecord }

function resolveEntity(ref: EntityRef | null, sorted: ModelRecord[], color: string): ResolvedEntity | null {
  if (!ref) return null
  if (ref.kind === "model") {
    const m = sorted.find((x) => x.id === ref.id); if (!m) return null
    return { kind: "model", label: m.name, sublabel: m.org, color, models: [m], best: m }
  }
  const ms = sorted.filter((x) => x.org === ref.id); if (!ms.length) return null
  return { kind: "company", label: ref.id, sublabel: `${ms.length} models`, color, models: ms, best: ms[0] }
}

// ── Unified searchable picker (models + companies) ────────────────────────────

function EntityPicker({ sorted, orgs, value, onChange, onClear, placeholder, accent, autoOpen }: {
  sorted: ModelRecord[]; orgs: string[]; value: EntityRef | null
  onChange: (e: EntityRef) => void; onClear?: () => void; placeholder: string; accent: string; autoOpen?: boolean
}) {
  const [open, setOpen] = useState(!!autoOpen)
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const ql = q.trim().toLowerCase()
  const mMatches = sorted.filter((m) => !ql || m.name.toLowerCase().includes(ql) || m.org.toLowerCase().includes(ql)).slice(0, 40)
  const oMatches = orgs.filter((o) => !ql || o.toLowerCase().includes(ql))
  const current = value ? (value.kind === "model" ? sorted.find((m) => m.id === value.id)?.name ?? "—" : value.id) : ""
  const pick = (e: EntityRef) => { onChange(e); setOpen(false); setQ("") }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-[12px] rounded-md px-3 py-1.5 min-w-[210px] text-left"
        style={{ background: "var(--bg-elevated)", color: current ? "var(--text-primary)" : "var(--text-tertiary)", border: `1px solid ${value ? accent : "var(--border-subtle)"}` }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
        <span className="flex-1 truncate">{current || placeholder}</span>
        {onClear && <span onClick={(e) => { e.stopPropagation(); onClear() }} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-1">×</span>}
        <span className="text-[var(--text-tertiary)]">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[300px] rounded-lg shadow-lg overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models or companies…"
            className="w-full px-3 py-2 text-[12px] outline-none" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }} />
          <div className="max-h-72 overflow-y-auto py-1">
            {oMatches.length > 0 && <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Companies</div>}
            {oMatches.map((o) => (
              <button key={`o-${o}`} onClick={() => pick({ kind: "company", id: o })} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text-primary)" }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: orgColor(o) }} />{o}
              </button>
            ))}
            {mMatches.length > 0 && <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Models</div>}
            {mMatches.map((m) => (
              <button key={`m-${m.id}`} onClick={() => pick({ kind: "model", id: m.id })} className="w-full flex items-baseline justify-between gap-2 px-3 py-1.5 text-[12px] text-left hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text-primary)" }}>
                <span className="truncate">{m.name}</span><span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{m.org}</span>
              </button>
            ))}
            {oMatches.length === 0 && mMatches.length === 0 && <div className="px-3 py-3 text-[11px]" style={{ color: "var(--text-tertiary)" }}>No matches.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compact stacked scorecard (downloadable) ──────────────────────────────────

function ScoreStack({ ent, models }: { ent: ResolvedEntity; models: ModelRecord[] }) {
  const s = ent.best
  const rank = rankOf(models, "intelligence_index", true, num(s, "intelligence_index"))
  const beats = beatsPct(models, "intelligence_index", true, num(s, "intelligence_index"))
  const rows: [string, string][] = [
    ["Intelligence rank", rank ? `#${rank} / ${models.length}` : "—"],
    ["Beats of field", beats != null ? `${beats}%` : "—"],
    ["Intelligence", fmt(num(s, "intelligence_index"), 1)],
    ["Coding", fmt(num(s, "coding_index"), 1)],
    ["Price $/M", fmt(num(s, "price_blended"), 2)],
    ["Speed tok/s", fmt(num(s, "tokens_per_sec"), 0)],
    ent.kind === "company" ? ["Models", String(ent.models.length)] : ["Weights", s.open_weight ? "Open" : "Closed"],
  ]
  return (
    <div className="rounded-xl px-3.5 py-3.5 h-full" style={{ background: "var(--bg-surface)", border: `1px solid ${ent.color}33` }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ent.color }} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{truncate(ent.label, 26)}</div>
          <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>{ent.sublabel}{ent.kind === "company" ? ` · best: ${truncate(ent.best.name, 20)}` : ""}</div>
        </div>
      </div>
      <div className="flex flex-col">
        {rows.map(([l, v], i) => (
          <div key={l} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{l}</span>
            <span className="text-[13px] font-mono font-semibold tabular-nums" style={{ color: i < 2 ? ent.color : "var(--text-primary)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Radar (percentile; outer edge = best in field) ────────────────────────────

function Radar({ entities, models, size = 248 }: {
  entities: { label: string; color: string; model: ModelRecord }[]; models: ModelRecord[]; size?: number
}) {
  const n = RADAR_METRICS.length
  const cx = size / 2, cy = size / 2, r = size / 2 - 34, lr = r + 16
  const angle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2
  const pt = (i: number, v: number) => ({ x: cx + v * r * Math.cos(angle(i)), y: cy + v * r * Math.sin(angle(i)) })
  const grid = (lvl: number) => RADAR_METRICS.map((_, i) => { const { x, y } = pt(i, lvl); return `${i === 0 ? "M" : "L"} ${x} ${y}` }).join(" ") + " Z"
  const pctv = (mi: number, v: number | null) => { const p = beatsPct(models, RADAR_METRICS[mi].key, RADAR_METRICS[mi].hi, v); return p == null ? 0 : p / 100 }
  const poly = (m: ModelRecord) => RADAR_METRICS.map((mm, i) => { const { x, y } = pt(i, pctv(i, num(m, mm.key))); return `${i === 0 ? "M" : "L"} ${x} ${y}` }).join(" ") + " Z"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {[0.25, 0.5, 0.75, 1].map((lvl) => <path key={lvl} d={grid(lvl)} fill="none" stroke={lvl === 1 ? "#DDE3EC" : "#EDF0F6"} strokeWidth={lvl === 1 ? 0.75 : 0.5} />)}
      {RADAR_METRICS.map((_, i) => { const { x, y } = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#DDE3EC" strokeWidth={0.5} /> })}
      {entities.map((e) => <path key={e.label} d={poly(e.model)} fill={e.color} fillOpacity={0.12} stroke={e.color} strokeWidth={2} strokeLinejoin="round" />)}
      {RADAR_METRICS.map((m, i) => { const a = angle(i), lx = cx + lr * Math.cos(a), ly = cy + lr * Math.sin(a)
        return <text key={m.key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={8.5} fontWeight={500} fill="#4A5878">{m.short}</text> })}
    </svg>
  )
}

// ── Standing bars (single = one fill; head-to-head = paired fills + delta) ─────

function StandingBars({ focal, rival, models }: { focal: ResolvedEntity; rival: ResolvedEntity | null; models: ModelRecord[] }) {
  const rows = BENCH.map((m) => {
    const fv = num(focal.best, m.key)
    if (fv == null) return null
    const rv = rival ? num(rival.best, m.key) : null
    return { m, fv, fpct: beatsPct(models, m.key, m.hi, fv) ?? 0, frank: rankOf(models, m.key, m.hi, fv), rv, rpct: rv != null ? (beatsPct(models, m.key, m.hi, rv) ?? 0) : null }
  }).filter(Boolean) as { m: Metric; fv: number; fpct: number; frank: number | null; rv: number | null; rpct: number | null }[]

  return (
    <div className="space-y-2.5">
      {rival && (
        <div className="flex items-center gap-4 mb-1">
          <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: focal.color }} />{truncate(focal.label, 26)}</span>
          <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: rival.color }} />{truncate(rival.label, 26)}</span>
        </div>
      )}
      {rows.map(({ m, fv, fpct, frank, rv, rpct }) => {
        const delta = rv != null ? fv - rv : null
        const focalWins = rv != null ? (m.hi ? fv > rv : fv < rv) : null
        return (
          <div key={String(m.key)} className="flex items-center gap-3">
            <span className="text-[11px] w-28 shrink-0 text-right" style={{ color: "var(--text-secondary)" }}>{m.short}</span>
            <div className="flex-1 rounded relative" style={{ background: "var(--bg-elevated)", height: rival ? 40 : 16 }}>
              {rival ? (
                <>
                  <div className="absolute left-0 rounded-r" style={{ top: 4, height: 14, width: `${fpct}%`, background: focal.color, opacity: 0.9 }} />
                  <span className="absolute left-2 flex items-center text-[10px] font-mono font-semibold" style={{ top: 4, height: 14, color: "var(--text-primary)" }}>{fmt(fv, m.dec)}</span>
                  <div className="absolute left-0 rounded-r" style={{ bottom: 4, height: 14, width: `${rpct}%`, background: rival.color, opacity: 0.9 }} />
                  <span className="absolute left-2 flex items-center text-[10px] font-mono font-semibold" style={{ bottom: 4, height: 14, color: "var(--text-primary)" }}>{fmt(rv, m.dec)}</span>
                </>
              ) : (
                <>
                  <div className="absolute left-0 top-0 h-full rounded-r" style={{ width: `${fpct}%`, background: focal.color, opacity: 0.85 }} />
                  <span className="absolute left-2 top-0 h-full flex items-center text-[10px] font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(fv, m.dec)}</span>
                </>
              )}
            </div>
            {rival ? (
              <span className="text-[10px] font-mono tabular-nums w-16 shrink-0 text-right" style={{ color: focalWins ? focal.color : rival.color, fontWeight: 600 }}>
                {delta != null ? `${delta > 0 ? "+" : ""}${fmt(delta, m.dec)}` : "—"}
              </span>
            ) : (
              <span className="text-[10px] font-mono tabular-nums w-24 shrink-0" style={{ color: frank === 1 ? "var(--accent-green)" : "var(--text-tertiary)" }}>#{frank} · beats {fpct}%</span>
            )}
          </div>
        )
      })}
      <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
        Bar = percentile across all {models.length} models with a score (empty = field minimum).{rival ? " Δ = focal − rival (colored by winner)." : " “beats X%” = share of the field this value tops."}
      </p>
    </div>
  )
}

// ── Release-over-time dots (a company's models; no trendline) ──────────────────

const REL_METRICS: { key: keyof ModelRecord; label: string }[] = [
  { key: "intelligence_index", label: "Intelligence" },
  { key: "coding_index", label: "Coding" },
  { key: "math_index", label: "Math" },
]
const NOW = Date.now()
const MINDATE = new Date("2023-01-01").getTime()
const OPEN_COLOR = "#E8A317", CLOSED_COLOR = "#2C4D9E"

function ReleaseDots({ ent }: { ent: ResolvedEntity }) {
  const [mk, setMk] = useState<keyof ModelRecord>("intelligence_index")
  const [hov, setHov] = useState<{ d: number; v: number; m: ModelRecord } | null>(null)
  const W = 380, H = 210, PL = 32, PB = 26, PT = 12, PR = 14
  const pw = W - PL - PR, ph = H - PT - PB
  const pts = ent.models.filter((m) => m.release_date && m[mk] != null && m.release_date >= "2023-01-01")
    .map((m) => ({ d: new Date(m.release_date!).getTime(), v: m[mk] as number, m }))
  const maxV = Math.max(40, ...pts.map((p) => p.v)) * 1.1
  const toX = (d: number) => PL + ((d - MINDATE) / (NOW - MINDATE)) * pw
  const toY = (v: number) => PT + (1 - v / maxV) * ph
  const metricLabel = REL_METRICS.find((o) => o.key === mk)?.label ?? ""
  const qmarks: { x: number; label: string; major: boolean }[] = []
  for (let yr = 2023; yr <= 2026; yr++) {
    for (const [mo, label, major] of [["01", String(yr), true], ["04", "Q2", false], ["07", "Q3", false], ["10", "Q4", false]] as [string, string, boolean][]) {
      const t = new Date(`${yr}-${mo}-01`).getTime()
      if (t > MINDATE && t < NOW) qmarks.push({ x: toX(t), label, major })
    }
  }
  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] px-5 pt-4 pb-7">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{truncate(ent.label, 22)} — Releases Over Time</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Each dot is a model release; Y = {metricLabel} Index, X = release date. Source: Artificial Analysis Intelligence Index.</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {REL_METRICS.map((o) => (
            <button key={String(o.key)} onClick={() => setMk(o.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
                mk === o.key ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]" : "text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:bg-[var(--bg-base)] hover:text-[var(--text-secondary)]"
              }`}>{o.label}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-5 mt-3 mb-2">
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: OPEN_COLOR }} />Open-weight</span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CLOSED_COLOR }} />Closed</span>
      </div>
      <div className="overflow-x-auto">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet" className="overflow-visible">
          {[0, 0.5, 1].map((f) => { const v = maxV * f, y = toY(v); return <g key={f}><line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#EDF0F6" /><text x={PL - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize={8} fill="#8E97AC">{Math.round(v)}</text></g> })}
          {qmarks.map((q, i) => (
            <g key={i}>
              <line x1={q.x} y1={PT} x2={q.x} y2={PT + ph} stroke={q.major ? "#DDE3EC" : "#EDF0F6"} strokeWidth={1} strokeDasharray={q.major ? undefined : "3 3"} />
              <text x={q.x} y={H - 8} textAnchor="middle" fontSize={q.major ? 8.5 : 7.5} fontWeight={q.major ? 600 : 400} fill={q.major ? "#8E97AC" : "#b8c8d8"}>{q.label}</text>
            </g>
          ))}
          {pts.map((p, i) => {
            const isHov = hov?.m.id === p.m.id
            return <circle key={i} cx={toX(p.d)} cy={toY(p.v)} r={isHov ? 6 : 4} fill={p.m.open_weight ? OPEN_COLOR : CLOSED_COLOR} fillOpacity={isHov ? 1 : 0.85} stroke="#fff" strokeWidth={1}
              style={{ cursor: "pointer" }} onMouseEnter={() => setHov(p)} onMouseLeave={() => setHov(null)} />
          })}
          {hov && (() => {
            const x = toX(hov.d), y = toY(hov.v)
            const tx = x > W * 0.6 ? x - 150 : x + 8, ty = y < 48 ? y + 8 : y - 46
            return (
              <g>
                <rect x={tx} y={ty} width={144} height={40} rx={4} fill="#0F1E3D" fillOpacity={0.95} />
                <text x={tx + 7} y={ty + 14} fontSize={9} fontWeight={600} fill="#fff" fontFamily="ui-sans-serif, system-ui">{truncate(hov.m.name, 23)}</text>
                <text x={tx + 7} y={ty + 26} fontSize={8} fill="#BCC4D2" fontFamily="ui-sans-serif, system-ui">{metricLabel}: {hov.v.toFixed(1)} · {hov.m.open_weight ? "open" : "closed"}</text>
                <text x={tx + 7} y={ty + 36} fontSize={7.5} fill="#8E97AC" fontFamily="ui-sans-serif, system-ui">{new Date(hov.d).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</text>
              </g>
            )
          })()}
          {pts.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={10} fill="#8E97AC">No dated releases with this metric</text>}
          <line x1={PL} y1={PT} x2={PL} y2={PT + ph} stroke="#8E97AC" /><line x1={PL} y1={PT + ph} x2={W - PR} y2={PT + ph} stroke="#8E97AC" />
        </svg>
      </div>
    </div>
  )
}

// ── Company lineup table ──────────────────────────────────────────────────────

function Lineup({ ent }: { ent: ResolvedEntity }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>{ent.label} lineup ({ent.models.length})</p>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["Model", "Intel", "Code", "Price", "Released"].map((h, i) => <th key={h} className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)", textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {ent.models.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-2 py-1.5" style={{ color: "var(--text-primary)" }}>{truncate(m.name, 28)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmt(num(m, "intelligence_index"), 1)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmt(num(m, "coding_index"), 1)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums" style={{ color: "var(--text-secondary)" }}>{fmt(num(m, "price_blended"), 2)}</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[11px]" style={{ color: "var(--text-tertiary)" }}>{m.release_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function CompareTab({ models }: { models: ModelRecord[]; rankings?: ModelsData["rankings"]; speech?: SpeechData | null }) {
  const sorted = useMemo(() => [...models].sort((a, b) => (b.intelligence_index ?? -1) - (a.intelligence_index ?? -1)), [models])
  const orgs = useMemo(() => Array.from(new Set(models.map((m) => m.org))).sort(), [models])

  const [focalRef, setFocalRef] = useState<EntityRef | null>(() => sorted[0] ? { kind: "model", id: sorted[0].id } : null)
  const [rivalRef, setRivalRef] = useState<EntityRef | null>(null)
  const [addingRival, setAddingRival] = useState(false)

  const focal = useMemo(() => resolveEntity(focalRef, sorted, ENTITY_COLORS[0]), [focalRef, sorted])
  const rival = useMemo(() => resolveEntity(rivalRef, sorted, ENTITY_COLORS[1]), [rivalRef, sorted])
  if (!focal) return <div className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-tertiary)" }}>No model data.</div>

  const isH2H = !!rival
  const highlightIds = new Set<string>([...focal.models.map((m) => m.id), ...(rival ? rival.models.map((m) => m.id) : [])])
  const radarEntities = [{ label: focal.best.name, color: focal.color, model: focal.best }, ...(rival ? [{ label: rival.best.name, color: rival.color, model: rival.best }] : [])]
  const dlSlug = slugify(focal.label) + (rival ? `-vs-${slugify(rival.label)}` : "")
  const companies = [focal, rival].filter((e): e is ResolvedEntity => !!e && e.kind === "company")

  // Color each highlighted model by its entity, and give the scatters a legend that
  // matches the emphasis (focal / rival / faded field) instead of the org legend.
  const highlightColors: Record<string, string> = {}
  focal.models.forEach((m) => { highlightColors[m.id] = focal.color })
  rival?.models.forEach((m) => { highlightColors[m.id] = rival.color })
  const highlightLegend = [
    { color: focal.color, label: truncate(focal.label, 22) },
    ...(rival ? [{ color: rival.color, label: truncate(rival.label, 22) }] : []),
    { color: "#C9D2DE", label: "Other models" },
  ]

  const RadarBlock = (
    <div className="rounded-xl px-3 py-3 flex flex-col items-center justify-center h-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      <Radar entities={radarEntities} models={models} />
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center max-w-[240px] mt-1">
        {radarEntities.map((e) => <span key={e.label} className="inline-flex items-center gap-1.5 text-[10px]"><span className="w-2 h-2 rounded-full" style={{ background: e.color }} /><span style={{ color: "var(--text-secondary)" }}>{truncate(e.label, 18)}</span></span>)}
      </div>
      <p className="text-[9.5px] mt-1.5 text-center leading-snug" style={{ color: "var(--text-tertiary)" }}>
        Each spoke = percentile vs all {models.length} models — <b>closer to the edge is better</b> (Price: cheaper ranks higher).
        Axes: Intelligence, Coding, Math, GPQA, Price, Speed.
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Picker bar */}
      <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Compare</span>
        <EntityPicker sorted={sorted} orgs={orgs} value={focalRef} onChange={setFocalRef} placeholder="Pick a model or company" accent={ENTITY_COLORS[0]} />
        <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>vs.</span>
        {(rivalRef || addingRival)
          ? <EntityPicker sorted={sorted} orgs={orgs} value={rivalRef} onChange={(e) => { setRivalRef(e); setAddingRival(false) }} onClear={() => { setRivalRef(null); setAddingRival(false) }} placeholder="Choose a model or company…" accent={ENTITY_COLORS[1]} autoOpen={!rivalRef} />
          : <button onClick={() => setAddingRival(true)} className="text-[12px] rounded-md px-3 py-1.5" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px dashed var(--border-subtle)" }}>+ add comparison</button>}
        <span className="ml-auto text-[11px]" style={{ color: "var(--text-tertiary)" }}>{isH2H ? "Head-to-head" : `Focal vs. all ${models.length} models`}</span>
      </div>

      {/* Top row: scorecard(s) + radar (radar centered in head-to-head) */}
      <div className={`grid gap-4 items-stretch ${isH2H ? "lg:grid-cols-[260px_1fr_260px]" : "lg:grid-cols-2"} grid-cols-1`}>
        <DownloadableNode filename={`${slugify(focal.label)}-scorecard.png`}><ScoreStack ent={focal} models={models} /></DownloadableNode>
        <DownloadableNode filename={`${dlSlug}-radar.png`}>{RadarBlock}</DownloadableNode>
        {rival && <DownloadableNode filename={`${slugify(rival.label)}-scorecard.png`}><ScoreStack ent={rival} models={models} /></DownloadableNode>}
      </div>

      {/* Standing bars */}
      <DownloadableNode filename={`${dlSlug}-benchmarks.png`}>
        <div className="rounded-xl px-4 py-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Benchmarks{isH2H ? " — head to head" : " — where it stands"}</p>
          <StandingBars focal={focal} rival={rival} models={models} />
        </div>
      </DownloadableNode>

      {/* Release-over-time (companies) — always half-width so a single one isn't huge */}
      {companies.length > 0 && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start">
          {companies.map((c) => <DownloadableNode key={c.label} corner="br" filename={`${slugify(c.label)}-releases.png`}><ReleaseDots ent={c} /></DownloadableNode>)}
        </div>
      )}

      {/* Field scatters (focal/rival highlighted) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <DownloadableNode corner="br" filename={`${dlSlug}-cost-vs-intelligence.png`}><CostScatter models={models} highlightIds={highlightIds} highlightColors={highlightColors} highlightLegend={highlightLegend} /></DownloadableNode>
        <DownloadableNode corner="br" filename={`${dlSlug}-speed-vs-intelligence.png`}><SpeedVsIntelligence models={models} highlightIds={highlightIds} highlightColors={highlightColors} highlightLegend={highlightLegend} /></DownloadableNode>
      </div>

      {/* Lineups (companies) */}
      {companies.length > 0 && (
        <div className={`grid gap-4 grid-cols-1 items-start ${companies.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {companies.map((c) => <Lineup key={c.label} ent={c} />)}
        </div>
      )}
    </div>
  )
}
