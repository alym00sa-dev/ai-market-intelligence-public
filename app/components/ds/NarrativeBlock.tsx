import type { ReactNode } from "react"

export type NarrativeTone = "building" | "watch-out" | "positive" | "risk"

type Props = {
  tone?: NarrativeTone
  children: ReactNode
  className?: string
}

const TONE_CLASS: Record<NarrativeTone, string> = {
  "building":  "",
  "watch-out": "is-watch-out",
  "positive":  "is-positive",
  "risk":      "is-risk",
}

export function NarrativeBlock({ tone = "building", children, className }: Props) {
  return (
    <div className={`narrative-block ${TONE_CLASS[tone]} ${className ?? ""}`.trim()}>
      {children}
    </div>
  )
}
