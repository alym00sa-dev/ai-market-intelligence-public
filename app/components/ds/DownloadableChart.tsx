"use client"

import { useRef } from "react"
import { downloadSvgAsPng } from "./downloadSvg"

/**
 * Wraps any chart that renders an <svg> and adds a small "Download PNG" button
 * underneath it. Finds the first SVG in its subtree and exports it.
 */
export function DownloadableChart({
  filename,
  children,
}: {
  filename: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div ref={ref}>{children}</div>
      <button
        onClick={() => {
          const svg = ref.current?.querySelector("svg")
          if (svg) downloadSvgAsPng(svg, filename)
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors"
        style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        Download PNG
      </button>
    </div>
  )
}
