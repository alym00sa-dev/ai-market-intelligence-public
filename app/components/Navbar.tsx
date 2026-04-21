"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const DATA_SOURCES = [
  { label: "Hiring Signals",          href: "/",        available: true  },
  { label: "Frontier Model Tracking", href: "/models",  available: true  },
]

export default function Navbar({ scrapedAt }: { scrapedAt: string | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const activeSource = DATA_SOURCES.find((s) =>
    s.href === "/" ? pathname === "/" || pathname.startsWith("/company") : pathname.startsWith(s.href)
  ) ?? DATA_SOURCES[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <nav className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-sm text-white px-4 sm:px-6 h-14 flex items-center justify-between border-b border-white/[0.06]">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-sm tracking-tight">AI Market Intelligence</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {scrapedAt && (
          <span className="hidden sm:block text-xs text-gray-500">
            Updated {scrapedAt}
          </span>
        )}

        {/* Data source dropdown */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span>{activeSource.label}</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-1.5 w-56 bg-gray-900 rounded-lg shadow-xl border border-gray-700 py-1 z-50">
              {DATA_SOURCES.map((source) => {
                const isActive = source.href === activeSource.href
                return (
                  <Link
                    key={source.label}
                    href={source.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      isActive ? "text-white bg-gray-800" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-green-400" : "bg-gray-600"}`} />
                    {source.label}
                    {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />}
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
