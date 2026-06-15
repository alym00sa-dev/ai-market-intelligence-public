import type { ReactNode } from "react"

export type PillTone = "blue" | "red" | "green" | "amber" | "muted"

type Props = {
  tone?: PillTone
  children: ReactNode
  className?: string
}

export function StatusPill({ tone = "muted", children, className }: Props) {
  return (
    <span className={`pill pill-${tone} ${className ?? ""}`.trim()}>
      {children}
    </span>
  )
}
