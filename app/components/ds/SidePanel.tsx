"use client"

import { useEffect, type ReactNode } from "react"

type Props = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  ariaLabel?: string
}

export function SidePanel({ open, onClose, title, children, ariaLabel }: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <>
      <div
        className={`side-panel-backdrop ${open ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`side-panel ${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : "Detail panel")}
        aria-hidden={!open}
      >
        <header className="side-panel-header">
          {title && <h2 className="side-panel-title">{title}</h2>}
          <button
            type="button"
            className="side-panel-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        {children}
      </aside>
    </>
  )
}
