"""
Per-job vertical + social_impact classifier.

Runs as TWO separate LLM passes so each classifier stays focused:
  Pass 1: vertical       — "health_rd" | "health_delivery" | "agriculture" | "education" | null
  Pass 2: social_impact  — true | false

Model: claude-opus-4-6  (accuracy over speed)
Batching: 20 jobs per API call

Usage:
  python vertical_classifier.py                  # both passes
  python vertical_classifier.py --verticals-only
  python vertical_classifier.py --social-only
"""

import json
import os
import time
import argparse
from pathlib import Path

import anthropic

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

MODEL = "claude-opus-4-7"
BATCH_SIZE = 20
JOBS_PATH = Path(__file__).parent.parent / "public/data/jobs.json"

# ── Prompts ───────────────────────────────────────────────────────────────────

VERTICAL_PROMPT = """\
For each job below, pick ONE vertical if the job is specifically focused on that industry.
Most jobs will be null. Return a JSON array — one object per job.

Verticals:
  health_rd        — Drug discovery, biomedical AI, clinical research, genomics, medical imaging research
  health_delivery  — Hospital systems, EHR, clinical decision support, patient-facing health apps, telehealth, healthcare operations
  agriculture      — Precision farming, crop science, agricultural AI, food tech, agri supply chain, weather, weather prediction, climate modeling, climate tech, climate AI, agriculture
  education        — EdTech, tutoring platforms, curriculum development, K-12/university systems, learning platforms, academic access programs
  null             — No specific vertical focus (the vast majority of roles)

Return ONLY a valid JSON array, no explanation:
[
  {{"id": "<job id>", "vertical": "<value or null>"}},
  ...
]

─── JOBS ───
{jobs_block}
"""

SOCIAL_IMPACT_PROMPT = """\
For each job below, decide whether it is a "social impact" role.

A social impact role is one whose PRIMARY purpose is to DIRECTLY serve the public,
public institutions, or to deploy AI with an explicit public-benefit mandate.

Qualifies as social impact:
  - AI policy, government affairs, public advocacy
  - Civic tech, humanitarian or NGO-focused work
  - Public health access programs (not private healthcare selling)
  - Educational access programs for underserved communities
  - Roles explicitly supporting public-sector or nonprofit institutions
  - Beneficial AI deployment — positions explicitly mandated to deploy AI for social good,
    expand access to underserved communities, or run programs (e.g. "AI for Good",
    nonprofit/NGO partnerships, academic access programs) where the primary stated
    purpose is public benefit rather than commercial revenue
  - Sales or GTM roles where the explicit focus is on public institutions, nonprofits, NGOs,
    academic institutions, or government agencies AS BENEFICIARIES — e.g.
    "Account Executive, Academic Medical Centers", "Head of GTM, Claude for Education",
    "Partnerships Lead, Nonprofit Programs". The commercial motion can qualify if the
    primary beneficiary is a public or civic entity.

Does NOT qualify as social impact:
  - Pure internal AI safety / alignment research with no direct public benefit mandate
  - Trust & safety / responsible AI / AI ethics (internal product governance)
  - General commercial enterprise sales with no explicit public-sector or social-good focus
  - General engineering, research, or GTM roles with no explicit public-service mandate
  - Standard enterprise features even if the end customer happens to do good work

Return ONLY a valid JSON array, no explanation:
[
  {{"id": "<job id>", "social_impact": <true|false>}},
  ...
]

─── JOBS ───
{jobs_block}
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def format_job(job: dict) -> str:
    what = job.get("what", "") or ""
    if what.startswith("Classification failed"):
        what = ""
    desc = job.get("description", "") or ""
    context = what or desc[:120].replace("\n", " ")
    return (
        f"id={job['id']} | company={job.get('company','')} | "
        f"title={job.get('title','')} | dept={job.get('department','')} | "
        f"what={context}"
    )


def _call_batch(client: anthropic.Anthropic, prompt: str, batch: list[dict], default: dict) -> list[dict]:
    jobs_block = "\n".join(f"{i+1}. {format_job(j)}" for i, j in enumerate(batch))
    full_prompt = prompt.format(jobs_block=jobs_block)
    # Retry transient failures (connection errors / timeouts) before defaulting —
    # otherwise a single network blip defaults a whole batch to null/false, which is
    # what blanked Anthropic's verticals (its early batches hit a connection storm).
    last_err: Exception | None = None
    for attempt in range(5):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=1200,
                messages=[{"role": "user", "content": full_prompt}],
            )
            text = resp.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text.strip())
        except Exception as e:
            last_err = e
            wait = 5 * (attempt + 1)
            print(f"  [batch attempt {attempt + 1} failed] {e}. Retry in {wait}s")
            time.sleep(wait)
    print(f"  [batch error] giving up after retries: {last_err}")
    return [{"id": j["id"], **default} for j in batch]


# ── Keyword safety net (catches signal lost in the 'what' summary) ────────────

# Title/department keyword backstop for the LLM. Ordered so the more specific health
# buckets win before the generic ones. Broadened after the first run blanked obvious
# roles ("Life Sciences" → health_rd, "Higher Education" → education).
KEYWORD_VERTICALS: list[tuple[list[str], str]] = [
    (["weather", "climate model", "climate ai", "climate tech", "climate modeling",
      "precision farm", "crop science", "crop ", "agri", "agricultur", "food tech",
      "irrigation", "farming"], "agriculture"),
    (["drug discovery", "genomic", "biomedical", "medical imaging", "clinical research",
      "radiology", "pathology", "life science", "life-science", "biolog", "biotech",
      "drug development", "therapeutic", "molecul", "protein", "oncolog", "pharma"], "health_rd"),
    (["ehr", "electronic health record", "telehealth", "clinical decision", "patient-facing",
      "patient ", "hospital", "healthcare operation", "health system", "health-system",
      "care delivery", "medical record"], "health_delivery"),
    (["edtech", "ed-tech", "k-12", "k12", "curriculum", "tutoring", "learning platform",
      "academic", "higher education", "education", "university", "universities", "school",
      "student", "teacher", "classroom", "learning science"], "education"),
]

def keyword_safety_net(jobs: list[dict]) -> int:
    """Scan title+department for vertical keywords the LLM may have missed. Returns patch count."""
    patched = 0
    for job in jobs:
        if job.get("vertical"):
            continue
        text = " ".join([
            (job.get("title") or ""),
            (job.get("department") or ""),
        ]).lower()
        for keywords, vertical in KEYWORD_VERTICALS:
            if any(kw in text for kw in keywords):
                job["vertical"] = vertical
                patched += 1
                break
    return patched


# ── Pass 1: Verticals ─────────────────────────────────────────────────────────

def classify_verticals(client: anthropic.Anthropic, jobs: list[dict]) -> None:
    total = len(jobs)
    batches = [jobs[i:i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    print(f"\n── Pass 1: Verticals ({total} jobs, {len(batches)} batches) ──")

    results_by_id: dict[str, dict] = {}
    for idx, batch in enumerate(batches):
        print(f"  batch {idx+1}/{len(batches)}...", end=" ", flush=True)
        results = _call_batch(client, VERTICAL_PROMPT, batch, {"vertical": None})
        for r in results:
            results_by_id[r["id"]] = r
        print("done")
        time.sleep(0.5)

    counts: dict[str, int] = {}
    for job in jobs:
        r = results_by_id.get(job["id"])
        v = (r.get("vertical") or None) if r else None
        job["vertical"] = v
        if v:
            counts[v] = counts.get(v, 0) + 1

    patched = keyword_safety_net(jobs)
    if patched:
        print(f"  Keyword safety net patched {patched} additional jobs")
        counts = {}
        for job in jobs:
            if job.get("vertical"):
                counts[job["vertical"]] = counts.get(job["vertical"], 0) + 1

    print(f"  Vertical breakdown: {counts}")


# ── Pass 2: Social Impact ─────────────────────────────────────────────────────

def classify_social_impact(client: anthropic.Anthropic, jobs: list[dict]) -> None:
    total = len(jobs)
    batches = [jobs[i:i + BATCH_SIZE] for i in range(0, total, BATCH_SIZE)]
    print(f"\n── Pass 2: Social Impact ({total} jobs, {len(batches)} batches) ──")

    results_by_id: dict[str, dict] = {}
    for idx, batch in enumerate(batches):
        print(f"  batch {idx+1}/{len(batches)}...", end=" ", flush=True)
        results = _call_batch(client, SOCIAL_IMPACT_PROMPT, batch, {"social_impact": False})
        for r in results:
            results_by_id[r["id"]] = r
        print("done")
        time.sleep(0.5)

    si_count = 0
    for job in jobs:
        r = results_by_id.get(job["id"])
        si = bool(r.get("social_impact", False)) if r else False
        job["social_impact"] = si
        if si:
            si_count += 1

    pct = round(si_count / total * 100) if total else 0
    print(f"  Social impact roles: {si_count} ({pct}%)")


# ── Entry point ───────────────────────────────────────────────────────────────

def run(verticals_only: bool = False, social_only: bool = False) -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=api_key, max_retries=6, timeout=120.0)

    with open(JOBS_PATH) as f:
        data = json.load(f)

    jobs = data["jobs"]
    print(f"Loaded {len(jobs)} jobs from {JOBS_PATH.name}")

    if not social_only:
        classify_verticals(client, jobs)

    if not verticals_only:
        classify_social_impact(client, jobs)

    with open(JOBS_PATH, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nSaved to {JOBS_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Classify jobs by vertical and/or social impact")
    parser.add_argument("--verticals-only", action="store_true", help="Only run the vertical pass")
    parser.add_argument("--social-only", action="store_true", help="Only run the social impact pass")
    parser.add_argument("--input", type=str, default=None, help="Override input jobs.json path")
    parser.add_argument("--output", type=str, default=None, help="Override output path (defaults to --input if set)")
    args = parser.parse_args()

    if args.input or args.output:
        JOBS_PATH = Path(args.output or args.input)

    run(verticals_only=args.verticals_only, social_only=args.social_only)
