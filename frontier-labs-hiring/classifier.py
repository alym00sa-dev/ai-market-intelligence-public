"""
Claude-powered job classifier.

Sends batches of job titles + departments + descriptions to Claude and returns:
  - category:          engineering | research | sales_gtm | operations
  - sub_area:          specific org function (controlled vocab per category)
  - what:              one specific sentence on what they build / sell / research
  - theme:             primary capability/agenda theme (controlled vocab) or null
  - themes_secondary:  0–2 additional themes (controlled vocab)

`theme` is the strategic-signal dimension: a controlled vocabulary of frontier-AI
capability areas that we trend week-over-week to detect hiring-agenda shifts
(e.g. biosecurity → pretraining). It applies mainly to engineering/research roles;
most sales/ops roles are theme=null. Freeform tags were removed — their 3.5k-string
uncontrolled vocabulary was unusable for aggregation.
"""

import json
import os
import re
import time

import anthropic

BATCH_SIZE = 25
MODEL = "claude-haiku-4-5-20251001"
API_TIMEOUT = 60  # seconds per request

# ── Controlled theme vocabulary (the signal axis) ─────────────────────────────
# Keep in sync with track_changes.py / the dashboard. Adding a theme is additive;
# renaming one breaks week-over-week continuity, so treat the list as stable.
THEMES = [
    "foundation_pretraining", "post_training_rl", "reasoning", "multimodal",
    "agents_tool_use", "interpretability", "alignment_safety", "evals_red_teaming",
    "security_misuse", "biosecurity_cbrn", "robotics_embodied",
    "training_infra_compute", "inference_serving", "data_pipeline",
    "product_app_layer", "developer_platform",
]

SYSTEM_PROMPT = """You are an expert analyst of AI industry hiring patterns.
You classify job listings from frontier AI companies with precision."""

CLASSIFICATION_PROMPT = """Classify each of these job listings from AI companies.

## 1. category + sub_area (the org function)

**engineering** — building technical systems
  - software_engineering: product/backend/frontend/full-stack SWEs, systems, devops, SRE
  - platform_infra: compute infrastructure, data centers, GPU clusters, networking, cloud, data pipelines
  - hardware: silicon, chips, TPU/GPU design, FPGA, devices, robotics hardware, semiconductor
  - security: security engineering, GRC, infosec, vulnerability research
  - product_management: product managers (technical or outbound), PMs embedded in product/eng

**research** — scientific investigation
  - research: ALL research roles — AI/ML researchers, research scientists, applied scientists, research engineers, safety/alignment researchers

**sales_gtm** — revenue generation
  - sales: account executives, field sales, sales reps, sales development, sales management
  - solutions: solutions architects/engineers, applied AI engineers (technical pre/post-sales)
  - business_development: BD reps, partnerships, channel, ecosystem, international expansion
  - marketing: marketing, content, brand, demand gen, PR, communications (external-facing)
  - customer_success: customer success/account managers, customer support, onboarding

**operations** — keeping the org running
  - program_management: technical program managers, project managers, ops program managers
  - finance: finance, accounting, FP&A, tax, treasury, investor relations
  - legal: legal counsel, compliance, contracts, regulatory
  - hr: recruiting, HR, people ops, talent acquisition, compensation
  - facilities: facilities, real estate, data center operations, supply chain, procurement, construction
  - design: product design, UX, brand/visual design, creative direction
  - trust_safety: trust & safety, content moderation, abuse, safeguards, enforcement operations
  - policy: government affairs, public policy, external affairs, internal communications

## 2. theme (the capability/agenda signal — THIS IS THE IMPORTANT PART)

Pick the PRIMARY theme that best captures the technical capability or research
agenda the role advances, plus up to 2 secondary themes. Use null when no theme
fits (true for most sales/ops and generic roles). Read the title AND description
carefully — distinguish e.g. pretraining from post-training, alignment from product trust&safety.

  - foundation_pretraining: pretraining base/foundation models, scaling laws, large training runs, pretraining data curation, tokenization
  - post_training_rl: RLHF, RL, fine-tuning, preference optimization, instruction tuning, reward modeling, alignment-via-training
  - reasoning: reasoning capability, chain-of-thought, RL for reasoning, math/code reasoning, test-time compute
  - multimodal: vision, image generation, audio, speech, video, multimodal models
  - agents_tool_use: agentic systems, tool use, computer use, autonomous agents, function calling, agent frameworks
  - interpretability: mechanistic interpretability, model internals, transparency research
  - alignment_safety: AI alignment & safety research, scalable oversight, honesty/harmlessness (research — NOT product trust&safety ops)
  - evals_red_teaming: evaluations, benchmarks, capability measurement, dangerous-capability evals, red teaming
  - security_misuse: model/cyber security, misuse & threat intelligence, adversarial robustness
  - biosecurity_cbrn: biological/chemical/nuclear/radiological risk, bio safety, CBRN safeguards
  - robotics_embodied: robotics, embodied AI, world models, physical AI, manipulation
  - training_infra_compute: training infrastructure, GPU/TPU clusters, data centers, networking, distributed training, accelerators
  - inference_serving: inference optimization, model serving, latency/throughput, kernels, compilers, quantization
  - data_pipeline: data engineering for training, annotation/labeling, RL environments, synthetic data
  - product_app_layer: applied product features and end-user apps built on top of models (e.g. coding agents, chat apps)
  - developer_platform: API, SDK, developer tools, platform for external developers

## 3. what
One SPECIFIC sentence on what they build / sell / research. Name the concrete
system, model, customer, or research area. Avoid generic phrases like "AI systems"
or "ML models" — say what kind (e.g. "low-latency inference serving for the API",
"mechanistic interpretability of transformer circuits", "enterprise sales to healthcare").

## Rules
- Exactly one of the four categories. sub_area must be from that category's list.
- theme + each secondary theme must be from the theme list above, or theme=null.
- themes_secondary is a (possibly empty) list; do not repeat the primary theme in it.

Jobs to classify:
{job_list}

Respond with ONLY a valid JSON array in the same order as the input — no markdown, no explanation:
[
  {{"category": "...", "sub_area": "...", "what": "...", "theme": "... or null", "themes_secondary": ["..."]}},
  ...
]"""


def classify_jobs(jobs: list[dict]) -> list[dict]:
    """
    Enriches each job dict with: category, sub_area, what, tags.
    """
    # Generous SDK-level retries/timeout: a multi-hour run over a flaky network
    # otherwise drops whole batches to "other" on a single transient connection error.
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=6, timeout=120.0)
    classified = []

    for i in range(0, len(jobs), BATCH_SIZE):
        batch = jobs[i: i + BATCH_SIZE]
        print(f"  Classifying {i + 1}–{min(i + BATCH_SIZE, len(jobs))} of {len(jobs)}...")
        results = _classify_batch(client, batch)
        for job, result in zip(batch, results):
            classified.append({**job, **result})
        if i + BATCH_SIZE < len(jobs):
            time.sleep(0.5)

    return classified


_THEME_SET = set(THEMES)
_CATEGORIES = {"engineering", "research", "sales_gtm", "operations"}
# Known leaks where the model put a sub_area/theme/typo in the category field.
_CATEGORY_FIX = {
    "product_management": "engineering",
    "data_pipeline": "engineering",
    "sales_gtmo": "sales_gtm",
}


def _sanitize(result: dict) -> dict:
    """Coerce category + theme fields to their controlled vocabularies."""
    cat = result.get("category", "other")
    cat = _CATEGORY_FIX.get(cat, cat)
    if cat not in _CATEGORIES:
        cat = "other"

    theme = result.get("theme")
    if theme not in _THEME_SET:
        theme = None
    secondary = [t for t in (result.get("themes_secondary") or [])
                 if t in _THEME_SET and t != theme]
    return {
        "category": cat,
        "sub_area": result.get("sub_area", "unknown"),
        "what": result.get("what", ""),
        "theme": theme,
        "themes_secondary": secondary[:2],
    }


def _classify_batch(client: anthropic.Anthropic, batch: list[dict]) -> list[dict]:
    job_list = "\n".join(
        f"{idx + 1}. [{job['company']}] {job['title']}"
        + (f" — {job['department']}" if job.get("department") else "")
        + (f"\n   {job['description'][:700]}" if job.get("description") else "")
        for idx, job in enumerate(batch)
    )

    # Retry transient failures (connection errors / timeouts / occasional off-by-one
    # counts) with backoff before falling back to defaults. Without this, a single
    # network blip turns 25 jobs into "other"/"Classification failed".
    last_err: Exception | None = None
    for attempt in range(5):
        try:
            message = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": CLASSIFICATION_PROMPT.format(job_list=job_list)}],
            )
            raw = message.content[0].text.strip()

            # Strip markdown fences if present
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = raw.rstrip("`").strip()

            results = json.loads(raw)

            if len(results) != len(batch):
                raise ValueError(f"Expected {len(batch)} results, got {len(results)}")

            return [_sanitize(r) for r in results]

        except Exception as e:
            last_err = e
            wait = 5 * (attempt + 1)
            print(f"    [classifier] attempt {attempt + 1} failed: {e}. Retry in {wait}s")
            time.sleep(wait)

    print(f"    [classifier] giving up after retries: {last_err}. Using defaults.")
    return [
        {"category": "other", "sub_area": "unknown", "what": "Classification failed.",
         "theme": None, "themes_secondary": []}
        for _ in batch
    ]
