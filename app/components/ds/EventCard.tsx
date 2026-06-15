import type { ReactNode } from "react"
import { StatusPill, type PillTone } from "./StatusPill"

export type Sentiment = "positive" | "negative" | "neutral"

const SENTIMENT_TONE: Record<Sentiment, PillTone> = {
  positive: "green",
  negative: "red",
  neutral:  "muted",
}

const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral:  "Neutral",
}

type Props = {
  eventType: ReactNode
  outlet: ReactNode
  date: ReactNode
  significance?: number
  sourceCount?: number
  sentiment?: Sentiment
  headline: ReactNode
  href?: string
  description?: ReactNode
  analyst?: ReactNode
  className?: string
}

export function EventCard({
  eventType,
  outlet,
  date,
  significance,
  sourceCount,
  sentiment,
  headline,
  href,
  description,
  analyst,
  className,
}: Props) {
  return (
    <article className={`event-card ${className ?? ""}`.trim()}>
      <div className="event-card-meta">
        <StatusPill tone="muted">{eventType}</StatusPill>
        <span className="event-card-outlet">{outlet}</span>
        <span className="event-card-date">· {date}</span>
        {typeof significance === "number" && (
          <span className="event-card-significance">{significance}/10</span>
        )}
        {typeof sourceCount === "number" && (
          <span className="event-card-significance">{sourceCount} sources</span>
        )}
        {sentiment && (
          <StatusPill tone={SENTIMENT_TONE[sentiment]}>
            {SENTIMENT_LABEL[sentiment]}
          </StatusPill>
        )}
      </div>

      {href ? (
        <a
          className="event-card-headline"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {headline}
        </a>
      ) : (
        <span className="event-card-headline">{headline}</span>
      )}

      {description && <p className="event-card-description">{description}</p>}
      {analyst && <p className="event-card-analyst">{analyst}</p>}
    </article>
  )
}
