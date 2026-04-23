# Artificial Analysis — INFO

## What This Is

Data pulled from [Artificial Analysis](https://artificialanalysis.ai) — an independent benchmarking platform that evaluates LLMs and generative media models on quality, speed, and cost. Coverage spans 478 LLMs and 400+ media models across text-to-image, video, speech, and image editing.

- **Base URL**: `https://artificialanalysis.ai/api/v2`
- **Auth**: `x-api-key` header
- **Rate limit**: 1,000 requests/day (free tier); retries with backoff built into `fetch.py`
- **Docs**: https://artificialanalysis.ai/api-reference

```bash
python fetch.py   # pulls all endpoints, skips already-saved files
```

---

## Data Files

### `llms_models.json` — 478 models

The richest dataset. Each model record contains:

**Identity**
- `id`, `name`, `slug`, `release_date`
- `model_creator` — org name + slug (e.g. Anthropic, OpenAI, Meta)

**Benchmark Evaluations** (`evaluations` object)

| Field | What it measures |
|-------|-----------------|
| `artificial_analysis_intelligence_index` | AA's composite general intelligence score (0–100) |
| `artificial_analysis_coding_index` | AA's composite coding score (0–100) |
| `artificial_analysis_math_index` | AA's composite math score (0–100) |
| `mmlu_pro` | Massive Multitask Language Understanding Pro — academic knowledge across 57 domains (0–1) |
| `gpqa` | Graduate-level science questions (0–1) |
| `hle` | Humanity's Last Exam — extremely hard multi-domain questions (0–1) |
| `livecodebench` | Live coding benchmark on recent competitive programming problems (0–1) |
| `scicode` | Scientific coding tasks (0–1) |
| `math_500` | MATH 500 — competition math problems (0–1) |
| `aime` | AIME math competition problems (0–1) |
| `aime_25` | 2025 AIME problems specifically (0–1) |
| `ifbench` | Instruction following benchmark (0–1) |
| `lcr` | Long context reasoning (0–1) |
| `terminalbench_hard` | Terminal/shell task benchmark, hard split (0–1) |
| `tau2` | Tool-augmented understanding benchmark (0–1) |

Most models have `null` on benchmarks they haven't been evaluated on — not a zero.

**Pricing** (`pricing` object)
- `price_1m_input_tokens` — cost per 1M input tokens (USD)
- `price_1m_output_tokens` — cost per 1M output tokens (USD)
- `price_1m_blended_3_to_1` — blended price at a 3:1 input/output ratio

**Speed**
- `median_output_tokens_per_second` — generation throughput
- `median_time_to_first_token_seconds` — latency to first token
- `median_time_to_first_answer_token` — latency to first meaningful response token

---

### `text_to_image.json` — 120 models

ELO-based rankings from human preference comparisons. Each model has:
- `elo`, `rank`, `ci95` (95% confidence interval), `appearances` (number of comparisons)
- `categories` (with `include_categories=true`) — per-style and per-subject breakdowns:
  - Style: General & Photorealistic, Cartoon & Illustration, Architecture & Interiors, etc.
  - Subject: Portraits, Landscapes, Objects, etc.

---

### `image_editing.json` — 53 models

ELO rankings for image editing (inpainting, style transfer, background removal, etc.). Fields: `elo`, `rank`, `ci95`, `appearances`.

---

### `text_to_speech.json` — 71 models

ELO rankings for TTS models. Fields: `elo`, `rank`, `ci95`. Fewer metadata fields than image models.

---

### `text_to_video.json` — 80 models

ELO rankings with per-category breakdowns by physics realism, motion quality, subject matter, format. Fields: `elo`, `rank`, `ci95`, `appearances`, `categories`.

---

### `image_to_video.json` — 74 models

ELO rankings for image-animation models (animating a still image into video). Same structure as text-to-video.

---

## Notes

- `null` on an evaluation field means the model hasn't been tested on that benchmark — not that it scored zero
- The LLMs endpoint response is ~400–500 KB; timeout is set to 60s
- Media endpoints occasionally rate-limit mid-run; `fetch.py` retries up to 3x with 15/30/45s waits
- Attribution required per API terms — cite `artificialanalysis.ai`
