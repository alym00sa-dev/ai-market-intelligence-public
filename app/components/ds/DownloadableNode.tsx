"use client"

import { useRef, useState } from "react"
import { toPng } from "html-to-image"

/**
 * Wraps any DOM subtree (SVG chart + its HTML legend, a scorecard, etc.) and adds
 * a "Download PNG" button that rasterizes the whole node — so legends and HTML
 * boxes are included, unlike the SVG-only downloader.
 */
export function DownloadableNode({
  filename,
  children,
  corner = "tr",
  className,
}: {
  filename: string
  children: React.ReactNode
  corner?: "tr" | "br"
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  const download = async () => {
    if (!ref.current || busy) return
    setBusy(true)
    try {
      const url = await toPng(ref.current, {
        pixelRatio: 2,
        cacheBust: true,
        // Transparent background — slide-ready PNG with no white box behind the rounded card.
        backgroundColor: undefined,
        // Strip interactive controls (metric/view toggles, fullscreen, reset, dropdowns)
        // so the exported image is clean. Hidden/aria-hidden nodes are dropped too.
        filter: (node: HTMLElement) => {
          const tag = node.tagName
          if (tag === "BUTTON" || tag === "SELECT" || tag === "INPUT") return false
          if (node.dataset?.noExport === "true") return false
          return true
        },
      })
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
    } catch (e) {
      console.warn("[DownloadableNode] export failed", e)
    } finally {
      setBusy(false)
    }
  }

  const pos = corner === "br" ? "bottom-2 right-2" : "top-2 right-2"
  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Captured subtree (h-full so wrapped cards can stretch to equal heights) */}
      <div ref={ref} className="h-full">{children}</div>
      {/* Button is a sibling (not captured) */}
      <button
        type="button"
        onClick={download}
        className={`absolute ${pos} z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors`}
        style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        {busy ? "…" : "Download PNG"}
      </button>
    </div>
  )
}
