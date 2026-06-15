import type { ReactNode } from "react"

export type Trend = {
  direction: "up" | "down" | "flat"
  label: ReactNode
}

type Props = {
  value: ReactNode
  label: ReactNode
  trend?: Trend
  className?: string
}

const ARROW: Record<Trend["direction"], string> = {
  up: "↑",
  down: "↓",
  flat: "→",
}

export function MetricCard({ value, label, trend, className }: Props) {
  return (
    <div className={`metric-card ${className ?? ""}`.trim()}>
      <div className="metric-card-value">{value}</div>
      <div className="metric-card-label">{label}</div>
      {trend && (
        <div className={`metric-card-trend is-${trend.direction}`}>
          <span aria-hidden>{ARROW[trend.direction]}</span>
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  )
}
