# Frontier Model Tracking — Design Document

## 1. Purpose

A second view in the dashboard dropdown (alongside "Hiring Signals") that answers:
**Who is releasing what models, how capable are they, how do they compare on cost and benchmarks, and how is the open vs. closed frontier evolving?**

Target audience: analysts tracking the competitive AI landscape — not just hiring momentum, but model-capability momentum.

---

## 2. Data Sources

| Source | Models | Key Strength |
|--------|--------|-------------|
| **Artificial Analysis** (`llms_models.json`) | 478 LLMs | Independently measured benchmarks, speed, pricing. Composite intelligence/coding/math indices. Also covers 120 text-to-image, 53 image-editing, 71 TTS, 80 text-to-video, 74 image-to-video models. |
| **LLM Stats** (`models.json`, `model_details.json`, `rankings.json`) | 291 LLMs | Open-weight flag, param count, license, modalities, TrueSkill rankings across 26 categories. Aggregates scores from many sources. |

These two datasets **overlap on most frontier models** (GPT-4o, Claude, Gemini, Llama, Qwen, Mistral, DeepSeek, etc.) and complement each other: AA has better benchmark depth, LLM Stats has better model metadata.

---

## 3. What the Data Can Support

### 3a. Open vs. Closed Weight

**Source: LLM Stats only** (AA has no open-weight field)

- 176 open-weight models, 115 closed
- Open-weight is heavily dominated by: Alibaba/Qwen (45), Mistral (30), DeepSeek (21), Google (14), Meta (9), Microsoft (9)
- Could show: open vs. closed split over time, % of new releases that are open, top open-weight orgs

> **Gap:** AA's 478 models don't have an open-weight flag. For frontier models that appear in both datasets, we can join on name/org. For AA-only models, we'd need a manual lookup or inference from org.

---

### 3b. Release Timeline

**Source: Both** — AA has dates on all 478, LLM Stats on 289/291

Release activity by year (AA):
- 2023: 20 models
- 2024: 75 models
- 2025: 287 models
- 2026: 95 models (partial year, already)

Can render as: release cadence chart per org, acceleration curve, "models released in last 90 days" feed.

> **No geography in raw data.** We can infer org → country (Anthropic → US, Mistral → France, DeepSeek → China, Alibaba → China, etc.) via a manual mapping. ~27 unique orgs — manageable. This gives us a "country of origin" lens.

---

### 3c. Cost

**Source: Both**, good overlap

- AA: 311/478 models have input/output/blended pricing (USD per 1M tokens)
- LLM Stats: 179/291 models have pricing via providers (in micro-USD/M tokens, need ÷1M)

Can render: cost vs. capability scatter (price vs. AA intelligence index), cheapest models above a performance threshold, cost trajectory over time (are models getting cheaper?).

> **Note:** prices are API prices at time of fetch. They change. We'd want to timestamp and re-fetch periodically.

---

### 3d. Benchmarks & Capability Domains

**Two complementary benchmark sets:**

**Artificial Analysis** (independently measured):
| Benchmark | Domain | Coverage |
|-----------|--------|----------|
| AA Intelligence Index | Composite general | 471/478 |
| AA Coding Index | Composite coding | 381/478 |
| AA Math Index | Composite math | 269/478 |
| GPQA | Graduate science | 449/478 |
| HLE | Extreme difficulty multi-domain | 445/478 |
| MMLU Pro | Academic knowledge (57 domains) | 345/478 |
| LiveCodeBench | Live competitive coding | 343/478 |
| IFBench | Instruction following | 377/478 |
| LCR | Long context reasoning | 377/478 |
| TerminalBench Hard | Shell/terminal tasks | 363/478 |
| Tau2 | Tool use | 369/478 |
| SciCode | Scientific coding | 443/478 |
| AIME 25 | 2025 math competition | 269/478 |

**LLM Stats TrueSkill Rankings** (aggregated, top-10 per category):
`reasoning`, `coding`, `math`, `language`, `general`, `tool_calling`, `long_context`,
`healthcare`, `legal`, `finance`, `biology`, `physics`, `safety`, `vision`, `agents`,
`multimodal`, `creativity`, `factuality`, `writing`, `communication`, `search`, `summarization`, `instruction_following`, `video`

(Note: `audio` category exists but 0 models ranked currently)

Can render: leaderboard tables per domain, radar charts per model, head-to-head comparisons.

---

### 3e. Media Models (Bonus — AA only)

| Type | Count |
|------|-------|
| Text-to-image | 120 models |
| Image editing | 53 models |
| Text-to-speech | 71 models |
| Text-to-video | 80 models |
| Image-to-video | 74 models |

All have ELO rankings with 95% CI. Text-to-image and both video types have per-category breakdowns (style, subject, motion quality, etc.).

This is a differentiating dataset — very few dashboards surface media model capability alongside LLM benchmarks.

---

## 4. Key Gaps

| Gap | Severity | Workaround |
|-----|----------|------------|
| No geography in raw data | Medium | Manual org → country mapping (~27 orgs) |
| AA has no open-weight field | Medium | Join with LLM Stats on model name/org |
| Prices are a snapshot, not time-series | Low | Re-fetch periodically; timestamp each pull |
| Context window missing from LLM Stats (0/291) | Low | Pull from model_details or AA if available |
| LLM Stats benchmark scores are often self-reported | Low | Flag `is_self_reported: true` in UI |

---

## 5. Proposed View Areas

### A. Frontier Leaderboard
Table: top N models ranked by AA Intelligence Index. Columns: model, org, open/closed, release date, intelligence score, coding score, math score, cost/1M blended, speed (tok/s). Filterable by org, open-weight toggle, date range.

### B. Capability Radar
Pick any 2–3 models → overlay radar chart across 6 normalized dimensions: reasoning, coding, math, long context, tool use, instruction following. Side-by-side cost comparison below.

### C. Release Timeline
Bar chart or stream chart: models released per quarter, grouped by org or open vs. closed. Shows acceleration of release cadence 2023→2026.

### D. Cost vs. Capability Scatter
X: AA Intelligence Index. Y: blended price per 1M tokens. Each dot = one model. Color by org. Log scale on Y. Quadrant labels: "expensive + capable", "cheap + capable" (sweet spot), etc.

### E. Domain Rankings (LLM Stats TrueSkill)
Tabs or accordion: reasoning / coding / healthcare / legal / finance / safety / etc. Each shows top-10 ranked models with TrueSkill score, open-weight badge, price.

### F. Media Models (Optional — Phase 2)
ELO leaderboards for text-to-image, TTS, video generation. Separated from LLM section. Could be a sub-tab.

---

## 6. The "Improve Dashboard First?" Question

**Arguments for building this now:**
- The data is fully fetched and clean — no blockers
- It's an additive new view, doesn't touch the hiring signals view
- Gives the dashboard a second "intelligence layer" beyond hiring

**Arguments for improving the current dashboard first:**
- The hiring view still has pending work: vertical breakdown rows and social impact rows (vertical_classifier is running right now)
- Once those land, the company cards will be richer and the detail view more complete
- A polished hiring view is the core value prop — adding a second view while the first is half-finished dilutes focus

**Recommendation:** Finish the hiring view first (vertical + social impact rows, push to dashboard), then build Frontier Model Tracking as a clean Phase 2. The data will still be there — and we'll likely want to re-fetch it anyway to get fresher prices and any new model releases by then.

---

## 7. Open Questions Before Building

1. **Join strategy:** Do we want one unified model record (AA + LLM Stats merged), or keep them as separate tabs within the view?
2. **Org → country mapping:** Worth doing for a "geography of AI" angle, or out of scope?
3. **Media models:** Include in v1 or defer to later?
4. **Refresh cadence:** How often should this data be re-fetched? (Prices change weekly, new models drop constantly)
5. **Hiring × model signal:** Eventually, should we cross-reference hiring signals with model capability — e.g. "Anthropic is hiring heavily in research AND ranks #1 on safety benchmarks"?
