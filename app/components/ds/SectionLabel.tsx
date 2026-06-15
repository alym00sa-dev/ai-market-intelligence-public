import type { ReactNode } from "react"

type Props = {
  children: ReactNode
  className?: string
  as?: "div" | "h2" | "h3" | "h4" | "span"
}

export function SectionLabel({ children, className, as: Tag = "div" }: Props) {
  return <Tag className={`section-label ${className ?? ""}`.trim()}>{children}</Tag>
}
