"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { views } from "../views.config"

export default function Navbar() {
  const pathname = usePathname()
  const [signalsOpen, setSignalsOpen] = useState(false)
  const signalsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (signalsRef.current && !signalsRef.current.contains(e.target as Node)) {
        setSignalsOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSignalsOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const activeView = views.find((v) =>
    v.href === "/"
      ? pathname === "/" || pathname.startsWith("/company")
      : pathname.startsWith(v.href)
  )
  const isSignalsActive = !!activeView

  return (
    <nav className="navbar">
      <Link href="/" className="navbar-brand">
        <span>AI Market Intelligence</span>
      </Link>

      <div className="navbar-items">
        <div ref={signalsRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setSignalsOpen((v) => !v)}
            className={`navbar-item ${isSignalsActive ? "is-active" : ""}`}
            aria-expanded={signalsOpen}
            aria-haspopup="true"
          >
            <span>Signals</span>
            <span className={`navbar-caret ${signalsOpen ? "is-open" : ""}`}>▾</span>
          </button>
          {signalsOpen && (
            <div className="navbar-dropdown" role="menu">
              {views.map((v) => {
                const isActive = activeView?.href === v.href
                return (
                  <Link
                    key={v.href}
                    href={v.href}
                    onClick={() => setSignalsOpen(false)}
                    className={`navbar-dropdown-item ${isActive ? "is-active" : ""}`}
                    role="menuitem"
                  >
                    <span>{v.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
