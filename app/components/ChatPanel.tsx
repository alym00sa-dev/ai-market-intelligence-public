"use client"

import { useState, useRef, useEffect, useCallback } from "react"

// GPT models first — GPT-5.4-mini is the default
const MODELS = [
  { id: "gpt-5.4-mini",              label: "GPT-5.4 mini" },
  { id: "gpt-5.4",                   label: "GPT-5.4"      },
  { id: "claude-haiku-4-5-20251001", label: "Haiku"        },
  { id: "claude-sonnet-4-6",         label: "Sonnet"       },
  { id: "claude-opus-4-6",           label: "Opus"         },
]

function getSuggestions(selected: string[]): string[] {
  if (selected.length === 1) {
    const company = selected[0]
    return [
      `What is ${company} building right now?`,
      `What is ${company} selling and to whom?`,
      `Where is ${company} concentrating its hiring?`,
      `What does ${company}'s research vs engineering balance look like?`,
      `What are ${company}'s emerging technical focus areas?`,
    ]
  }
  return [
    "Which company is investing most in AI safety research?",
    "Compare enterprise sales motions across frontier AI labs",
    "Which companies are expanding most aggressively?",
    "How do Anthropic and OpenAI differ in technical focus?",
    "What geographies are frontier AI hiring concentrated in?",
    "Which company has the most diverse research agenda?",
  ]
}

type Message = { role: "user" | "assistant"; content: string }

type Props = {
  availableCompanies: string[]
  defaultCompany?: string
}

// ── Multi-select company dropdown ─────────────────────────────────────────────

function CompanyDropdown({
  companies,
  selected,
  onChange,
}: {
  companies: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const isAll = selected.length === 0
  const label = isAll
    ? "All companies"
    : selected.length === 1
    ? selected[0]
    : `${selected.length} companies`

  function toggle(c: string) {
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c])
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 flex items-center justify-between gap-1"
      >
        <span className="truncate">{label}</span>
        <svg
          className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-1">
            <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAll}
                onChange={() => onChange([])}
                className="w-3.5 h-3.5 rounded accent-indigo-500"
              />
              <span className="text-[12px] text-slate-700 font-medium">All companies</span>
            </label>
            <div className="mx-3 border-t border-slate-100 mb-1" />
            {companies.map((c) => (
              <label key={c} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.includes(c)}
                  onChange={() => toggle(c)}
                  className="w-3.5 h-3.5 rounded accent-indigo-500"
                />
                <span className="text-[12px] text-slate-600">{c}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MessageContent({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.replace(/^[-•]\s/, "")
          return (
            <div key={i} className="flex gap-1.5">
              <span className="text-slate-300 shrink-0 mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(content) }} />
            </div>
          )
        }
        if (line.startsWith("### ") || line.startsWith("## ")) {
          const content = line.replace(/^#+\s/, "")
          return <p key={i} className="font-semibold text-slate-800 mt-2 first:mt-0">{content}</p>
        }
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} dangerouslySetInnerHTML={{ __html: boldify(line) }} />
      })}
    </div>
  )
}

function boldify(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatPanel({ availableCompanies, defaultCompany }: Props) {
  const [model,             setModel]             = useState("gpt-5.4-mini")
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(
    defaultCompany ? [defaultCompany] : []
  )
  const [messages,    setMessages]    = useState<Message[]>([])
  const [input,       setInput]       = useState("")
  const [isStreaming, setIsStreaming] = useState(false)

  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Clear conversation when company selection changes
  useEffect(() => { setMessages([]) }, [selectedCompanies])

  // Scroll within the chat container only — scrollIntoView bubbles to the page
  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 96) + "px"
  }, [])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    const userMsg: Message = { role: "user", content: trimmed }
    const history = [...messages, userMsg]
    setMessages([...history, { role: "assistant", content: "" }])
    setIsStreaming(true)

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          companies: selectedCompanies,
          messages: history,
        }),
      })

      if (!res.ok) throw new Error(await res.text())
      if (!res.body) throw new Error("No response body")

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages([...history, { role: "assistant", content: accumulated }])
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong"
      setMessages([...history, { role: "assistant", content: `Sorry — ${msg}` }])
    } finally {
      setIsStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const suggestions = getSuggestions(selectedCompanies)

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Intelligence Chat
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <CompanyDropdown
            companies={availableCompanies}
            selected={selectedCompanies}
            onChange={setSelectedCompanies}
          />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="shrink-0 text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div>
            <p className="text-[11px] text-slate-400 mb-2.5 uppercase tracking-wide font-medium">
              Suggested
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left text-[12px] text-slate-500 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-100 rounded-xl px-3 py-2 transition-colors leading-relaxed"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[85%] bg-indigo-500 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-[13px] leading-relaxed">
                  {msg.content}
                </div>
              ) : (
                <div className="text-[13px] text-slate-600 leading-relaxed max-w-full">
                  {msg.content ? (
                    <MessageContent text={msg.content} />
                  ) : (
                    <span className="flex gap-1 items-center text-slate-300">
                      <span className="w-1 h-1 rounded-full bg-slate-300 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1 h-1 rounded-full bg-slate-300 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1 h-1 rounded-full bg-slate-300 animate-bounce [animation-delay:300ms]" />
                    </span>
                  )}
                  {isStreaming && i === messages.length - 1 && msg.content && (
                    <span className="inline-block w-0.5 h-3.5 bg-slate-400 ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-100 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about hiring trends…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none disabled:opacity-50 placeholder:text-slate-400 leading-relaxed"
            style={{ minHeight: "36px", maxHeight: "96px" }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 w-8 h-8 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">
          ↵ send · shift+↵ newline
        </p>
      </div>

    </div>
  )
}
