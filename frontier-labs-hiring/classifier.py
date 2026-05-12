"""
Claude-powered job classifier.

Sends batches of job titles + departments to Claude Haiku and returns:
  - category:  engineering | sales_gtm | research | operations | other
  - sub_area:  specific focus area
  - what:      one sentence on what they're building or selling
  - tags:      3–5 keyword tags
"""

import json
import os
import re
import time

import anthropic

BATCH_SIZE = 25
MODEL = "claude-haiku-4-5-20251001"
API_TIMEOUT = 60  # seconds per request

SYSTEM_PROMPT = """You are an expert analyst of AI industry hiring patterns.
You classify job listings from frontier AI companies with precision."""

CLASSIFICATION_PROMPT = """Classify each of these job listings from AI companies.

## Categories and allowed sub_areas

**engineering** — building technical systems
  sub_areas:
  - software_engineering: product engineers, backend/frontend/full-stack SWEs, systems engineers, ML-adjacent SWEs, devops, SRE
  - platform_infra: compute infrastructure, data centers, GPU clusters, networking, cloud platform, data pipelines, ETL
  - hardware: silicon, chips, TPU/GPU design, FPGA, devices, robotics hardware, semiconductor
  - security: security engineering, GRC, infosec, vulnerability research
  - product_management: product managers (technical or outbound), program managers embedded in product/eng

**research** — scientific investigation
  sub_areas:
  - research: ALL research roles — AI/ML researchers, research scientists, applied scientists, research engineers, safety/alignment researchers, data scientists doing research

**sales_gtm** — revenue generation
  sub_areas:
  - sales: account executives, field sales, sales reps, sales development, sales management
  - solutions: solutions architects, solutions engineers, applied AI engineers (technical pre/post-sales)
  - business_development: BD reps, partnerships, channel, ecosystem, international expansion
  - marketing: marketing, content, brand, demand gen, PR, communications (external-facing)
  - customer_success: customer success managers, account managers, customer support, onboarding

**operations** — keeping the org running
  sub_areas:
  - program_management: technical program managers, project managers, operations program managers
  - finance: finance, accounting, FP&A, tax, treasury, investor relations
  - legal: legal counsel, compliance, contracts, regulatory
  - hr: recruiting, HR, people ops, talent acquisition, compensation
  - facilities: facilities, real estate, data center operations, supply chain, procurement, construction
  - design: product design, UX, brand design, visual design, creative direction
  - trust_safety: trust & safety, content moderation, abuse, safeguards, enforcement operations
  - policy: government affairs, public policy, external affairs, internal communications (not PR/marketing)

## Rules
- Every job must be assigned one of the four categories above — there is no "other" category
- sub_area must be one of the allowed values listed under the assigned category
- For sales_gtm: "what" = what product/service they sell and to whom
- For engineering: "what" = what system or product they build
- For research: "what" = what they research
- For operations: "what" = what function they support

Jobs to classify:
{job_list}

Respond with ONLY a valid JSON array in the same order as the input — no markdown, no explanation:
[
  {{"category": "...", "sub_area": "...", "what": "...", "tags": ["...", "..."]}},
  ...
]"""


def classify_jobs(jobs: list[dict]) -> list[dict]:
    """
    Enriches each job dict with: category, sub_area, what, tags.
    """
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
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


def _classify_batch(client: anthropic.Anthropic, batch: list[dict]) -> list[dict]:
    job_list = "\n".join(
        f"{idx + 1}. [{job['company']}] {job['title']}"
        + (f" — {job['department']}" if job.get("department") else "")
        + (f"\n   {job['description'][:400]}" if job.get("description") else "")
        for idx, job in enumerate(batch)
    )

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

        return results

    except Exception as e:
        print(f"    [classifier] error: {e}. Using defaults.")
        return [
            {"category": "other", "sub_area": "unknown", "what": "Classification failed.", "tags": []}
            for _ in batch
        ]
