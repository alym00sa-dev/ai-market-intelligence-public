"use client"

import Link from "next/link"
import type { CompanyDetailData, SubAreaDetail, GeoRow as GeoRowData } from "../lib/company-detail"
import { SectionLabel, NarrativeBlock, DownloadableChart } from "./ds"

const DISPLAY_NAMES: Record<string, string> = {
  "Microsoft Research": "Microsoft",
  "Amazon AGI":         "Amazon",
}

const CAT_TOKEN: Record<string, string> = {
  engineering:  "var(--accent-blue)",
  research:     "var(--accent-amber)",
  sales_gtm:    "var(--accent-green)",
  operations:   "var(--text-secondary)",
  other:        "var(--border-medium)",
  unclassified: "var(--border-subtle)",
}

const CAT_LABEL: Record<string, string> = {
  engineering:  "Engineering",
  research:     "Research",
  sales_gtm:    "Sales / GTM",
  operations:   "Operations",
  other:        "Other",
  unclassified: "Unclassified",
}

// ── Radar chart (generic over dimensions) ────────────────────────────────────

const ROLE_DIMS = [
  { key: "research",    label: "Research" },
  { key: "engineering", label: "Eng" },
  { key: "sales_gtm",   label: "Sales" },
  { key: "operations",  label: "Ops" },
]
const VERT_DIMS = [
  { key: "health_rd",       label: "Health R&D" },
  { key: "health_delivery", label: "Health Del." },
  { key: "agriculture",     label: "Agriculture" },
  { key: "education",       label: "Education" },
]

function RadarChart({
  dims,
  breakdown,
  denom,
  size = 240,
  accent = "#2C4D9E",
  accentFill = "rgba(44, 77, 158, 0.10)",
}: {
  dims: { key: string; label: string }[]
  breakdown: Record<string, number>
  denom: number
  size?: number
  accent?: string
  accentFill?: string
}) {
  const n = dims.length
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 34
  const lr = r + 16

  const angle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2
  const pt = (i: number, v: number) => ({
    x: cx + v * r * Math.cos(angle(i)),
    y: cy + v * r * Math.sin(angle(i)),
  })

  const gridPath = (lvl: number) =>
    dims.map((_, i) => {
      const { x, y } = pt(i, lvl)
      return `${i === 0 ? "M" : "L"} ${x} ${y}`
    }).join(" ") + " Z"

  const values = dims.map((d) => (denom > 0 ? (breakdown[d.key] ?? 0) / denom : 0))

  const dataPath =
    values.map((v, i) => {
      const { x, y } = pt(i, v)
      return `${i === 0 ? "M" : "L"} ${x} ${y}`
    }).join(" ") + " Z"

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {[0.25, 0.5, 0.75, 1.0].map((lvl) => (
        <path key={lvl} d={gridPath(lvl)} fill="none"
          stroke={lvl === 1 ? "#DDE3EC" : "#EDF0F6"}
          strokeWidth={lvl === 1 ? 0.75 : 0.5} />
      ))}
      {dims.map((_, i) => {
        const { x, y } = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#DDE3EC" strokeWidth={0.75} />
      })}
      <path d={dataPath} fill={accentFill} stroke={accent} strokeWidth={2} strokeLinejoin="round" />
      {values.map((v, i) => {
        const { x, y } = pt(i, v)
        return <circle key={i} cx={x} cy={y} r={3} fill={accent} />
      })}
      {dims.map((d, i) => {
        const a = angle(i)
        const lx = cx + lr * Math.cos(a)
        const ly = cy + lr * Math.sin(a)
        const pct = denom > 0 ? Math.round(((breakdown[d.key] ?? 0) / denom) * 100) : 0
        return (
          <g key={d.key}>
            <text x={lx} y={ly - 4} textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fontWeight={500} fill="#4A5878">{d.label}</text>
            <text x={lx} y={ly + 4} textAnchor="middle" dominantBaseline="middle"
              fontSize={7.5} fill={pct > 0 ? "#8E97AC" : "#BCC4D2"}>
              {pct > 0 ? `${pct}%` : "—"}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Sub-area bar row ──────────────────────────────────────────────────────────

function SubAreaRow({
  area,
  maxCount,
  accentColor,
}: {
  area: SubAreaDetail
  maxCount: number
  accentColor: string
}) {
  const barPct = maxCount > 0 ? (area.count / maxCount) * 100 : 0

  return (
    <div
      className="py-4 last:border-0"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
          {area.label}
        </span>
        <span
          className="text-[12px] font-mono tabular-nums"
          style={{ color: "var(--text-tertiary)" }}
        >
          {area.count} roles · {area.pct}%
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden w-full mb-3"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${barPct}%`, background: accentColor }}
        />
      </div>

      {area.topTitles.length > 0 && (
        <p
          className="text-[11px] mb-2 leading-relaxed"
          style={{ color: "var(--text-tertiary)" }}
        >
          <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Roles: </span>
          {area.topTitles.join("  ·  ")}
        </p>
      )}

      {area.topLocations.length > 0 && (
        <p
          className="text-[11px] mb-2"
          style={{ color: "var(--text-tertiary)" }}
        >
          <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Locations: </span>
          {area.topLocations.join("  ·  ")}
        </p>
      )}

      {area.whatSamples.length > 0 && (
        <ul className="space-y-1 mt-2">
          {area.whatSamples.map((w, i) => (
            <li key={i} className="flex gap-1.5 items-start">
              <span style={{ color: "var(--text-tertiary)" }} className="mt-[3px] shrink-0">—</span>
              <span
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {w}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Geography row ─────────────────────────────────────────────────────────────

function GeoRow({ row, maxCount }: { row: GeoRowData; maxCount: number }) {
  const barPct = maxCount > 0 ? (row.count / maxCount) * 100 : 0
  const catOrder = ["engineering", "research", "sales_gtm", "operations", "other", "unclassified"]
  const activeCats = catOrder.filter((c) => (row.byCategory[c] ?? 0) > 0)

  return (
    <div
      className="py-3 last:border-0"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <p
          className="text-[13px] truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {row.city}
        </p>
        <span
          className="text-[12px] font-mono tabular-nums ml-2 shrink-0"
          style={{ color: "var(--text-tertiary)" }}
        >
          {row.count}
        </span>
      </div>

      <div
        className="h-1.5 rounded-full overflow-hidden mb-2"
        style={{ background: "var(--bg-elevated)", width: `${barPct}%` }}
      >
        <div className="flex h-full w-full">
          {activeCats.map((cat) => (
            <div
              key={cat}
              style={{
                background: CAT_TOKEN[cat],
                width: `${(row.byCategory[cat] / row.count) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {activeCats.map((cat) => {
          const pct = Math.round((row.byCategory[cat] / row.count) * 100)
          if (pct === 0) return null
          return (
            <span
              key={cat}
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: CAT_TOKEN[cat] }}
              />
              {CAT_LABEL[cat]} {pct}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl px-6 py-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      }}
    >
      <div className="flex items-baseline gap-2 mb-4">
        <SectionLabel as="h2">{title}</SectionLabel>
        {count !== undefined && (
          <span
            className="text-[11px] font-mono tabular-nums"
            style={{ color: "var(--text-tertiary)" }}
          >
            {count} roles
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Main detail view ──────────────────────────────────────────────────────────

const VERTICAL_ORDER = ["health_rd", "health_delivery", "agriculture", "education"] as const
const VERTICAL_LABELS: Record<string, string> = {
  health_rd: "Health R&D", health_delivery: "Health Delivery",
  agriculture: "Agriculture", education: "Education",
}
const CAT_LABEL_MAP: Record<string, string> = {
  engineering: "Engineering", research: "Research", sales_gtm: "Sales / GTM",
  operations: "Operations", other: "Other", unclassified: "Other",
}

export default function CompanyDetailView({ detail }: { detail: CompanyDetailData }) {
  const {
    company, total, categoryBreakdown,
    llmSummary, buildingAreas, sellingAreas, geoBreakdown,
    verticalBreakdown, socialImpactData,
  } = detail

  const buildingTotal = buildingAreas.reduce((s, a) => s + a.count, 0)
  const sellingTotal  = sellingAreas.reduce((s, a) => s + a.count, 0)
  const maxBuild = buildingAreas[0]?.count ?? 1
  const maxSell  = sellingAreas[0]?.count ?? 1
  const maxGeo   = geoBreakdown[0]?.count ?? 1

  const name = DISPLAY_NAMES[company] ?? company
  const fileBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

  return (
    <div className="px-4 sm:px-6 py-4 space-y-6 max-w-[1400px] mx-auto w-full">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="text-[12px] transition-colors flex items-center gap-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Frontier Hiring
        </Link>
        <span style={{ color: "var(--border-medium)" }}>/</span>
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {DISPLAY_NAMES[company] ?? company}
        </span>
      </div>

      {/* Header + overview */}
      <div
        className="rounded-xl px-6 py-6"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderLeft: "2px solid var(--accent-blue)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div className="flex items-baseline justify-between mb-6">
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              color: "var(--text-primary)",
              lineHeight: 1.15,
            }}
          >
            {DISPLAY_NAMES[company] ?? company}
          </h1>
          <span
            className="text-sm font-mono tabular-nums"
            style={{ color: "var(--text-tertiary)" }}
          >
            {total.toLocaleString()} open roles
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-8 items-start">
          <div className="shrink-0 mx-auto sm:mx-0">
            <DownloadableChart filename={`${fileBase}-role-mix.png`}>
              <RadarChart dims={ROLE_DIMS} breakdown={categoryBreakdown} denom={total} size={240} />
            </DownloadableChart>
          </div>

          <div
            className="hidden sm:block w-px self-stretch"
            style={{ background: "var(--border-subtle)" }}
          />

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 self-center">
            {llmSummary?.building && llmSummary.building.length > 0 && (
              <NarrativeBlock tone="building">
                <SectionLabel>Building</SectionLabel>
                <ul className="space-y-2 mt-1">
                  {llmSummary.building.map((b, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span
                        className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: "var(--accent-blue)" }}
                      />
                      <span
                        className="text-[13px] leading-relaxed"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              </NarrativeBlock>
            )}
            {llmSummary?.selling && llmSummary.selling.length > 0 && (
              <NarrativeBlock tone="positive">
                <SectionLabel>Selling</SectionLabel>
                <ul className="space-y-2 mt-1">
                  {llmSummary.selling.map((b, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span
                        className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: "var(--accent-green)" }}
                      />
                      <span
                        className="text-[13px] leading-relaxed"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              </NarrativeBlock>
            )}
          </div>
        </div>
      </div>

      {/* Vertical Focus card */}
      {(() => {
        const totalVertical = VERTICAL_ORDER.reduce((s, v) => s + (verticalBreakdown[v] ?? 0), 0)
        const verticalBullets = llmSummary?.vertical_bullets ?? {}
        return (
          <div
            className="rounded-xl px-6 py-7"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
          >
            <SectionLabel as="h2">Vertical Focus</SectionLabel>
            {totalVertical === 0 ? (
              <p
                className="text-[13px] italic mt-2"
                style={{ color: "var(--text-tertiary)" }}
              >
                Vertical hiring signals unclear from current data
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-10 items-start mt-4">
                <div className="shrink-0 mx-auto sm:mx-0">
                  <DownloadableChart filename={`${fileBase}-verticals.png`}>
                    <RadarChart dims={VERT_DIMS} breakdown={verticalBreakdown} denom={totalVertical} size={240} accent="#C77F2E" accentFill="rgba(199, 127, 46, 0.10)" />
                  </DownloadableChart>
                </div>
                <div className="hidden sm:block w-px self-stretch" style={{ background: "var(--border-subtle)" }} />
                <div className="flex-1 min-w-0 grid grid-cols-1 gap-y-6">
                {VERTICAL_ORDER.map((v) => {
                  const count   = verticalBreakdown[v] ?? 0
                  const bullets = verticalBullets[v] ?? []
                  return (
                    <div
                      key={v}
                      className="pl-3"
                      style={{ borderLeft: "2px solid var(--border-subtle)" }}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span
                          className="text-[11px] font-semibold uppercase tracking-widest"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {VERTICAL_LABELS[v]}
                        </span>
                        {count > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums"
                            style={{
                              background: "var(--accent-amber-bg)",
                              color: "var(--accent-amber)",
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </div>
                      {count === 0 ? (
                        <p
                          className="text-[11.5px] italic"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          No current hiring data for this vertical
                        </p>
                      ) : bullets.length > 0 ? (
                        <ul className="space-y-1.5">
                          {bullets.map((b, i) => (
                            <li key={i} className="flex gap-2 items-start">
                              <span
                                className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: "var(--accent-amber)" }}
                              />
                              <span
                                className="text-[12px] leading-relaxed"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {b}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p
                          className="text-[11.5px] italic"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          Roles present; analysis pending
                        </p>
                      )}
                    </div>
                  )
                })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Social Impact card */}
      {(() => {
        const { count, pct, byCategory } = socialImpactData
        const socialBullets = llmSummary?.social_impact_bullets ?? []
        const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0]
        const catLabel = topCat ? (CAT_LABEL_MAP[topCat] ?? topCat) : null
        return (
          <div
            className="rounded-xl px-6 py-5"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
          >
            <SectionLabel as="h2">Social Impact Roles</SectionLabel>
            <p
              className="text-[11px] italic mb-4 mt-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              Defined as: roles whose primary purpose directly serves the public — AI policy, civic tech, humanitarian work, public health or education access
            </p>
            {count === 0 ? (
              <p
                className="text-[13px] italic"
                style={{ color: "var(--text-tertiary)" }}
              >
                No social impact roles identified in current hiring data
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="shrink-0">
                  <p
                    className="text-3xl font-mono font-semibold tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {pct > 0 ? `${pct}%` : count}
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    of all roles
                  </p>
                  {catLabel && (
                    <p
                      className="text-[11px] mt-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Concentrated in<br />
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {catLabel}
                      </span>
                    </p>
                  )}
                  <div className="mt-3 space-y-1">
                    {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
                      <div key={cat} className="flex items-center gap-2">
                        <span
                          className="text-[10px] w-20 shrink-0"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {CAT_LABEL_MAP[cat] ?? cat}
                        </span>
                        <span
                          className="text-[10px] font-mono tabular-nums"
                          style={{ color: "var(--accent-green)", fontWeight: 500 }}
                        >
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className="hidden sm:block w-px self-stretch"
                  style={{ background: "var(--border-subtle)" }}
                />
                {socialBullets.length > 0 && (
                  <ul className="space-y-2 flex-1">
                    {socialBullets.map((b, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span
                          className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: "var(--accent-green)" }}
                        />
                        <span
                          className="text-[13px] leading-relaxed"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Three-column deep-dive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {buildingAreas.length > 0 && (
          <Section title="Building & Research" count={buildingTotal}>
            {buildingAreas.map((area) => (
              <SubAreaRow key={area.subArea} area={area} maxCount={maxBuild} accentColor="var(--accent-blue)" />
            ))}
          </Section>
        )}

        {sellingAreas.length > 0 && (
          <Section title="Sales & GTM" count={sellingTotal}>
            {sellingAreas.map((area) => (
              <SubAreaRow key={area.subArea} area={area} maxCount={maxSell} accentColor="var(--accent-green)" />
            ))}
          </Section>
        )}

        {geoBreakdown.length > 0 && (
          <Section title="Hiring Geography">
            {geoBreakdown.map((row) => (
              <GeoRow key={row.city} row={row} maxCount={maxGeo} />
            ))}
          </Section>
        )}
      </div>

    </div>
  )
}
