# LLM Stats — INFO

## What This Is

Data pulled from [LLM Stats](https://llm-stats.com) — a benchmark aggregation platform that collects scores across 480+ benchmarks for 291 models, computes TrueSkill-based rankings across 26 categories, and tracks newly released models. More breadth-focused than Artificial Analysis — it aggregates scores from many sources rather than running its own evals.

- **Base URL**: `https://api.llm-stats.com/stats/v1`
- **Auth**: `Authorization: Bearer {key}` header
- **Rate limits**: `/scores` 30/min (most restrictive), `/models` and `/benchmarks` 60/min, `/models/{id}` and `/rankings` 120/min
- **Site**: https://llm-stats.com

```bash
python fetch.py   # full paginated pull of all endpoints
```

---

## Data Files

### `models.json` — 291 models (catalog)

High-level catalog, paginated 50 at a time. Each record:
- `id`, `name` — model identifier and display name
- `organization` — org id + name (e.g. `anthropic`, `openai`, `meta`)
- `family` — model family if known (e.g. GPT-4, Claude 3)
- `license` — `id` (proprietary/apache/mit/etc.), `name`, `allow_commercial`
- `open_weight` — boolean; whether weights are publicly available
- `model_type` — `llm`, `vlm`, etc.
- `modalities` — list: `text`, `image`, `audio`, `video`
- `context_window` — max context length in tokens (null if unknown)
- `param_count` — parameter count (null if unknown)
- `release_date` — ISO date string
- `providers` — list of providers offering API access with `input_price_per_m` and `output_price_per_m` (in micro-USD per million tokens)

---

### `model_details.json` — 291 full model records

One API call per model (`/models/{id}`). Contains everything in the catalog plus:

- `description` — full model description text
- `top_scores` — dict of category → normalized score (e.g. `{"reasoning": 0.8, "coding": 0.75}`)
- `scores` — list of individual benchmark scores for this model:
  - `benchmark_id`, `benchmark_name`, `category`
  - `score` — raw score (scale varies by benchmark)
  - `normalized_score` — normalized 0–1 (null if not normalized)
  - `max_score` — the benchmark's max possible value
  - `is_self_reported` — whether the score came from the lab vs. independent testing
  - `verified_by_llmstats` — whether LLM Stats independently verified the score
  - `scored_at` — timestamp
- `sources` — links to `api_ref`, `paper`, `weights`, `repo`

---

### `benchmarks.json` — 480 benchmarks

The full benchmark catalog. Each benchmark:
- `id`, `name`, `description` — what the benchmark measures
- `categories` — which capability categories it falls under (can be multiple):
  - `reasoning`, `coding`, `math`, `language`, `general`, `tool_calling`, `long_context`
  - `healthcare`, `legal`, `finance`, `biology`, `physics`, `safety`, `vision`
  - `agents`, `multimodal`, `audio`, `video`, `creativity`, `factuality`, `writing`
  - `communication`, `search`, `summarization`, `instruction_following`
- `modality` — `text`, `image`, `audio`, etc.
- `max_score` — scale ceiling
- `language` — primary language (`en`, `zh`, multilingual)
- `verified` — whether LLM Stats has verified the benchmark methodology
- `model_count` — how many models have scores on this benchmark
- `paper_link` — arXiv or ACL paper link if available
- `implementation_link` — GitHub link to reference implementation

---

### `scores.json` — 13,139 benchmark scores

The full score matrix — every (model, benchmark) pair that exists. Paginated 100 at a time, 132 pages. Each score record:
- `model_id`, `model_name`, `organization`
- `benchmark_id`, `benchmark_name`, `category`
- `score` — raw score (scale varies; some are 0–1, some are point totals)
- `normalized_score` — 0–1 normalized score (null on many entries)
- `max_score` — max possible for this benchmark
- `is_self_reported` — lab-reported vs. independently tested
- `verified` — independently verified by LLM Stats
- `scored_at` — when this score was recorded

Note: `is_self_reported: true` + `verified: false` means take with caution — the lab reported their own number.

---

### `rankings.json` — TrueSkill rankings across 26 categories

Rankings computed using the TrueSkill rating system (the same algorithm used in Xbox matchmaking) — more robust than simple leaderboard averaging because it accounts for uncertainty and head-to-head comparisons. Top 10 models per category.

**26 categories**: `reasoning`, `coding`, `math`, `language`, `general`, `tool_calling`, `long_context`, `healthcare`, `legal`, `finance`, `biology`, `physics`, `safety`, `vision`, `agents`, `multimodal`, `audio`, `video`, `creativity`, `factuality`, `writing`, `communication`, `search`, `summarization`, `instruction_following`, `code`

Each category entry:
- `method` — always `trueskill`
- `ranked_at` — timestamp of last ranking computation
- `models` — top 10 ranked models, each with:
  - `rank`, `model_id`, `model_name`, `organization`
  - `score` — TrueSkill score (normalized 0–1)
  - `conservative_rating` — lower confidence bound (used for stable ranking)
  - `open_weight` — boolean
  - `min_input_price` — cheapest provider price per million tokens
  - `benchmarks_evaluated` — how many benchmarks contributed to this ranking

---

### `updates.json` — 50 models added in last 30 days

Recently added models. Fields mirror the catalog (`models.json`). Useful for tracking what's newly available. Re-fetch weekly to stay current.

---

## Notes

- Some scores appear duplicated in `scores.json` — this is upstream data, not a fetch bug
- `is_self_reported: true` is the majority of scores; independently verified scores are rarer
- Rankings are recomputed periodically — `ranked_at` timestamp tells you when
- `audio` category has 0 models ranked currently
- Provider prices in `model_details.json` are in micro-USD per million tokens (divide by 1,000,000 to get USD/token or multiply by 1 to get USD/1M)
