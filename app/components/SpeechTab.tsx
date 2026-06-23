"use client"

import { useState, useMemo } from "react"
import type { SpeechData, AsrModel, TtsModel } from "../types"
import { SectionLabel } from "./ds"

type Mode = "asr" | "tts"

const MODE_OPTS: { key: Mode; label: string; sub: string }[] = [
  { key: "asr", label: "Speech-to-Text", sub: "ASR · Word Error Rate" },
  { key: "tts", label: "Text-to-Speech", sub: "TTS · ELO" },
]

function fmt(n: number | null | undefined, dec = 1): string {
  return n == null ? "—" : n.toFixed(dec)
}

// ── Metric bar (normalized across the visible set) ───────────────────────────

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden min-w-[60px]" style={{ background: "var(--bg-elevated)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

function rankColor(rank: number, total: number): string {
  const t = total > 1 ? (rank - 1) / (total - 1) : 0
  if (t <= 0.15) return "var(--accent-green)"
  if (t <= 0.45) return "var(--accent-blue)"
  if (t <= 0.75) return "var(--accent-amber)"
  return "var(--accent-red)"
}

// ── ASR leaderboard (lower WER is better) ────────────────────────────────────

function AsrBoard({ models }: { models: AsrModel[] }) {
  const wers = models.map((m) => m.avg_wer)
  const min = Math.min(...wers), max = Math.max(...wers)
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["#", "Model", "Avg WER ↓", "RTFx ↑"].map((h, i) => (
              <th key={h} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-tertiary)", textAlign: i >= 2 ? "right" : "left", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
            <th className="px-3 py-2 w-[28%]" />
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            // lower WER → longer (better) bar
            const pct = max > min ? ((max - m.avg_wer) / (max - min)) * 100 : 100
            const color = rankColor(m.rank, models.length)
            return (
              <tr key={m.model + m.rank} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2 font-mono tabular-nums text-[11px]" style={{ color: "var(--text-tertiary)" }}>{m.rank}</td>
                <td className="px-3 py-2">
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: "var(--text-primary)" }}>
                      {m.model}
                    </a>
                  ) : (
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{m.model}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold" style={{ color }}>{fmt(m.avg_wer, 2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {m.rtfx == null ? "—" : Math.round(m.rtfx).toLocaleString()}
                </td>
                <td className="px-3 py-2"><Bar pct={pct} color={color} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── TTS leaderboard (higher ELO is better) ───────────────────────────────────

function TtsBoard({ models }: { models: TtsModel[] }) {
  const elos = models.map((m) => m.elo ?? 0)
  const min = Math.min(...elos), max = Math.max(...elos)
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["#", "Model", "Creator", "ELO ↑"].map((h, i) => (
              <th key={h} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-tertiary)", textAlign: i === 3 ? "right" : "left", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
            <th className="px-3 py-2 w-[28%]" />
          </tr>
        </thead>
        <tbody>
          {models.map((m, i) => {
            const rank = m.rank ?? i + 1
            const elo = m.elo ?? 0
            const pct = max > min ? ((elo - min) / (max - min)) * 100 : 100
            const color = rankColor(rank, models.length)
            return (
              <tr key={m.model + rank} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2 font-mono tabular-nums text-[11px]" style={{ color: "var(--text-tertiary)" }}>{rank}</td>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text-primary)" }}>{m.model}</td>
                <td className="px-3 py-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>{m.creator ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold" style={{ color }}>{m.elo ?? "—"}</td>
                <td className="px-3 py-2"><Bar pct={pct} color={color} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function SpeechTab({ speech }: { speech: SpeechData | null }) {
  const [mode, setMode] = useState<Mode>("asr")

  const active = useMemo(() => (mode === "asr" ? speech?.asr : speech?.tts), [mode, speech])

  if (!speech) {
    return (
      <div className="rounded-xl px-6 py-12 text-center" style={{ background: "var(--bg-surface)", border: "1px dashed var(--border-subtle)" }}>
        <p style={{ color: "var(--text-primary)", fontWeight: 500 }}>No speech data yet.</p>
        <code className="inline-block mt-3 px-4 py-2 rounded-lg text-sm font-mono" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
          cd model-cap-benchmarks/speech && python build_speech_json.py
        </code>
      </div>
    )
  }

  return (
    <div className="rounded-xl px-5 py-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* Mode toggle */}
      <div className="flex items-end gap-0 mb-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {MODE_OPTS.map((o) => {
          const on = mode === o.key
          return (
            <button key={o.key} type="button" onClick={() => setMode(o.key)}
              className="px-4 py-2 -mb-px text-left transition-colors"
              style={{ borderBottom: `2px solid ${on ? "var(--accent-blue)" : "transparent"}` }}>
              <div className="text-[13px] font-medium" style={{ color: on ? "var(--text-primary)" : "var(--text-secondary)" }}>{o.label}</div>
              <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{o.sub}</div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between mb-2">
        <SectionLabel as="span">{active?.count ?? 0} models · {active?.metric}</SectionLabel>
        <a href={active?.source} target="_blank" rel="noopener noreferrer"
          className="text-[10px] hover:underline" style={{ color: "var(--text-tertiary)" }}>
          {mode === "asr" ? "HF Open ASR Leaderboard ↗" : "Artificial Analysis ↗"}
        </a>
      </div>

      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
        {mode === "asr"
          ? <AsrBoard models={speech.asr.models} />
          : <TtsBoard models={speech.tts.models} />}
      </div>
    </div>
  )
}
