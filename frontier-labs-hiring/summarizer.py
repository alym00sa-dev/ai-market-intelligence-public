"""
Company-level summarizer with built-in verify + revise stage.

Pipeline per company per section (building / selling / verticals / social_impact):
  1. GENERATE  — Opus writes specific, data-grounded bullets
  2. VERIFY    — Sonnet checks each bullet against raw job data, returns
                 VERIFIED / PLAUSIBLE / FABRICATED + specific issue
  3. REVISE    — Opus rewrites any FABRICATED or PLAUSIBLE bullet using the
                 exact issue flagged by the verifier

Output schema:
  {company_name: {
    "building": [...],
    "selling": [...],
    "vertical_bullets": {"health_rd": [...], "health_delivery": [...], ...},
    "social_impact_bullets": [...]
  }}
"""

import os
import time
import anthropic

GENERATE_MODEL = "claude-opus-4-6"
VERIFY_MODEL   = "claude-sonnet-4-6"
REVISE_MODEL   = "claude-opus-4-6"

# ── Stage 1: Generate ─────────────────────────────────────────────────────────

BUILDING_PROMPT = """\
You are a market-intelligence analyst reading hiring signals. Below are job postings \
from the engineering and research teams at {company} ({count} roles). Each line is a \
role title followed by what that person will build or research.

{job_lines}

Write 4-5 bullet points describing what {company} is actively building or researching. \
Rules:
- Be specific and substantive — name the actual systems, models, pipelines, or research \
  areas you can infer from the titles and descriptions (e.g. "RLHF and constitutional AI \
  alignment pipeline", "low-latency inference serving for API at scale", "multimodal \
  vision-language pre-training").
- Include scale or concentration signals where evident \
  (e.g. "heavy investment in...", "dominant technical bet on...", "growing team of...").
- Do NOT write generic phrases like "AI systems", "machine learning models", or \
  "large language models" without specifics. Every bullet must name something concrete.
- Do NOT start with "the company is". Start each bullet with the specific thing itself.
- Only name a product, team, partner, or technology if it appears in the job postings.
- Each bullet: one full, specific sentence, 20–30 words.

Output ONLY a plain bullet list, nothing else. Example of the specificity level we want:
- Inference serving infrastructure for sub-100ms API latency, with dedicated compiler \
  and kernel optimization teams scaling across AWS multi-region
- Constitutional AI and RLHF alignment pipeline staffed with 20+ researchers focused \
  on honesty, harmlessness, and interpretability
- Agentic product layer (Claude Code, tool use) with prompt engineering and eval systems \
  built by a dedicated applied-AI team"""

SELLING_PROMPT = """\
You are a market-intelligence analyst reading hiring signals. Below are job postings \
from the sales and go-to-market teams at {company} ({count} roles). Each line is a \
role title followed by what that person will sell or drive commercially.

{job_lines}

Write 3-4 bullet points describing what {company} is selling, to whom, and through \
what motion. Rules:
- Name actual products or tiers being sold (API, Enterprise plan, cloud partnership, \
  specific vertical solution) — not just "AI products".
- Name specific customer segments visible in the titles \
  (Fortune 500, developers, healthcare, financial services, government, SMB, EMEA, etc.).
- Describe the GTM motion where visible (direct enterprise sales, PLG, channel, \
  solutions engineering-led, etc.).
- If geographic expansion is visible (specific language speakers, regional AE titles), \
  name it explicitly.
- Only name a product, geography, vertical, or partner if it appears in the job postings.
- Each bullet: one full, specific sentence, 20–30 words.

Output ONLY a plain bullet list, nothing else. Example of the specificity level we want:
- Claude API and Enterprise tier sold to Fortune 500 and regulated industries \
  (healthcare, finance, government) via direct field sales
- Solutions engineering-led expansion into developer ecosystems with dedicated \
  solutions architects per vertical
- Active EMEA buildout with French, German, and Spanish-speaking account executives \
  targeting enterprise customers in EU markets"""


VERTICAL_PROMPT = """\
You are a market-intelligence analyst reading hiring signals. Below are {count} job \
postings at {company} that focus specifically on the {vertical_label} vertical. \
Each line is a role title followed by what that person will build or sell.

{job_lines}

Write UP TO 3 bullet points describing what is being built, sold, or deployed in the \
{vertical_label} space. Only write a bullet if the job data genuinely supports a \
distinct, specific insight — do NOT write bullets to fill space. 1 strong bullet is \
better than 3 weak ones. Rules:
- Do NOT start with "{company} is" or mention the company name. Start each bullet \
  with the specific thing itself (e.g. "Dedicated Health AI product with full-stack \
  engineering..." or "Direct sales motion into healthcare and life sciences via...").
- Be specific and grounded in the job evidence — name actual systems, products, \
  customer types, or capabilities mentioned in the postings.
- Only name a product, technology, or customer type if it appears in the job postings.
- Do NOT write generic phrases. Every bullet must name something concrete.
- Each bullet: one full, specific sentence, 20–30 words.

Output ONLY a plain bullet list, nothing else.\
"""

SOCIAL_IMPACT_PROMPT = """\
You are a market-intelligence analyst. Below are {count} job postings at {company} \
flagged as social impact roles — broadly defined to include any work where the primary \
beneficiary is the public, a public institution, or an underserved community. This \
includes traditional social impact (policy, civic tech, humanitarian, public health/\
education access) AND beneficial AI deployment work that may not fit the traditional \
mold — nonprofit/NGO partnerships, academic programs, government-as-beneficiary roles, \
or any initiative where {company}'s explicit purpose is societal benefit over revenue.

{job_lines}

Write 2-3 bullets describing the trends and patterns across these roles — what {company} \
is doing, who benefits, and what the dominant thrust is. Let the insight flow naturally; \
do not use labels like "Who is served:" or "Dominant theme:". \
Be specific to the job evidence. 20-30 words each.

Output ONLY a plain bullet list.\
"""


# ── Stage 2: Verify (per bullet) ─────────────────────────────────────────────

VERIFY_PROMPT = """\
You are a strict fact-checker for an AI market-intelligence product.

Below are actual job postings (title + what the person will do) from {company}'s \
{section} team. After that is a summary bullet we generated about this company.

Your job: determine whether every SPECIFIC claim in the bullet is traceable to \
the job postings. Specific claims include:
- Exact or approximate numbers ("10+", "30+", "dominant")
- Named products, models, or codenames ("Claude Code", "Stargate", "Codex")
- Named technologies or infrastructure providers ("AWS", "RLHF", "constitutional AI")
- Named geographies or languages ("EMEA", "French-speaking", "Tokyo")
- Named customers or industries ("Fortune 500", "healthcare", "DoD")
- Named team structures ("dedicated team", "cross-functional safety team")

JOB POSTINGS:
{job_lines}

BULLET TO VERIFY:
"{claim}"

Reply in EXACTLY this format (two lines, no extra text):
STATUS: VERIFIED | PLAUSIBLE | FABRICATED
ISSUE: <the specific unverifiable claim, or "none">

Rules:
- VERIFIED only if ALL specifics are clearly supported by the postings.
- PLAUSIBLE if the general direction is correct but one specific detail \
  (e.g. a scale claim or a partner name) is an inference beyond the data.
- FABRICATED if a concrete specific (product name, number, geography, partner, \
  team name/codename) appears in the bullet but has NO basis in the postings.\
"""


# ── Stage 3: Revise flagged bullets ──────────────────────────────────────────

REVISE_PROMPT = """\
You are an editor for an AI market-intelligence product. A fact-checker flagged the \
bullet below as containing an unverifiable or fabricated claim.

JOB POSTINGS (the only source of truth):
{job_lines}

ORIGINAL BULLET:
"{bullet}"

FACT-CHECKER VERDICT: {status}
SPECIFIC ISSUE: {issue}

Rewrite the bullet to fix ONLY the flagged issue:
- Remove or replace the specific unverifiable claim called out above
- Keep all other details that ARE traceable to the job postings
- If it was FABRICATED (invented product name, codename, industry, geography): \
  replace with the function/capability the posting actually describes
- If it was PLAUSIBLE (inference beyond the data): soften the specific claim \
  (e.g. "multiple infrastructure roles" instead of "dedicated team of 20")
- Do NOT add any new claims not in the original bullet or the postings
- Keep the bullet at 20–30 words, one full sentence

Output ONLY the revised bullet text, no bullet prefix, no explanation.\
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_lines(jobs: list[dict], max_jobs: int) -> str:
    with_what    = [j for j in jobs if j.get("what") and not j["what"].startswith("Classification failed")]
    without_what = [j for j in jobs if not j.get("what") or j["what"].startswith("Classification failed")]
    ordered = (with_what + without_what)[:max_jobs]

    lines = []
    for j in ordered:
        line = f"- {j['title']}"
        if j.get("what") and not j["what"].startswith("Classification failed"):
            line += f": {j['what']}"
        elif j.get("description"):
            snippet = j["description"][:150].replace("\n", " ")
            line += f": {snippet}"
        lines.append(line)
    return "\n".join(lines)


def _parse_bullets(text: str) -> list[str]:
    bullets = [
        line.lstrip("-•* ").strip()
        for line in text.splitlines()
        if line.strip().startswith(("-", "•", "*"))
    ]
    return [b for b in bullets if b]


def _generate(client: anthropic.Anthropic, prompt: str, company: str, section: str) -> list[str]:
    try:
        resp = client.messages.create(
            model=GENERATE_MODEL,
            max_tokens=700,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_bullets(resp.content[0].text.strip())
    except Exception as e:
        print(f"    [generate] error for {company}/{section}: {e}")
        return []


def _verify_bullet(
    client: anthropic.Anthropic,
    company: str,
    section: str,
    job_lines: str,
    bullet: str,
) -> dict:
    """Returns {"status": VERIFIED|PLAUSIBLE|FABRICATED, "issue": str}"""
    try:
        resp = client.messages.create(
            model=VERIFY_MODEL,
            max_tokens=120,
            messages=[{
                "role": "user",
                "content": VERIFY_PROMPT.format(
                    company=company, section=section,
                    job_lines=job_lines, claim=bullet,
                ),
            }],
        )
        text = resp.content[0].text.strip()
        status, issue = "UNKNOWN", "could not parse"
        for line in text.splitlines():
            if line.startswith("STATUS:"):
                status = line.replace("STATUS:", "").strip().split()[0].upper()
            elif line.startswith("ISSUE:"):
                issue = line.replace("ISSUE:", "").strip()
        return {"status": status, "issue": issue}
    except Exception as e:
        return {"status": "ERROR", "issue": str(e)}


def _revise_bullet(
    client: anthropic.Anthropic,
    company: str,
    section: str,
    job_lines: str,
    bullet: str,
    status: str,
    issue: str,
) -> str:
    """Asks Sonnet to rewrite a flagged bullet fixing only the specific issue."""
    try:
        resp = client.messages.create(
            model=REVISE_MODEL,
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": REVISE_PROMPT.format(
                    job_lines=job_lines,
                    bullet=bullet,
                    status=status,
                    issue=issue,
                ),
            }],
        )
        revised = resp.content[0].text.strip().lstrip("-•* ").strip()
        return revised if revised else bullet
    except Exception as e:
        print(f"    [revise] error for {company}/{section}: {e}")
        return bullet


def _verify_and_revise(
    client: anthropic.Anthropic,
    company: str,
    section: str,
    job_lines: str,
    bullets: list[str],
) -> list[str]:
    """
    For each bullet: verify → if FABRICATED or PLAUSIBLE, revise.
    Returns cleaned bullet list.
    """
    if not bullets:
        return bullets

    final = []
    for bullet in bullets:
        result = _verify_bullet(client, company, section, job_lines, bullet)
        time.sleep(0.3)

        status = result["status"]
        issue  = result["issue"]

        if status in ("FABRICATED", "PLAUSIBLE") and issue.lower() != "none":
            icon = "✗" if status == "FABRICATED" else "~"
            print(f"      [{icon} {status}] revising: {bullet[:60]}...")
            print(f"               issue: {issue[:80]}")
            revised = _revise_bullet(client, company, section, job_lines, bullet, status, issue)
            print(f"               → {revised[:70]}")
            final.append(revised)
            time.sleep(0.5)
        else:
            print(f"      [✓ {status:<10}] {bullet[:70]}")
            final.append(bullet)

    return final


# ── Main export ───────────────────────────────────────────────────────────────

def summarize_companies(
    jobs: list[dict],
    existing_summaries: dict[str, dict] | None = None,
    only_new_sections: bool = False,
    regenerate_verticals: bool = False,
) -> dict[str, dict]:
    """
    Returns {company_name: {"building": [...], "selling": [...],
                             "vertical_bullets": {...}, "social_impact_bullets": [...]}}

    If only_new_sections=True, skips building/selling for companies that already
    have them in existing_summaries — only generates vertical_bullets and
    social_impact_bullets.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("  [summarizer] ANTHROPIC_API_KEY not set — skipping.")
        return {}

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    by_company: dict[str, list[dict]] = {}
    for job in jobs:
        co = job.get("company", "")
        if co:
            by_company.setdefault(co, []).append(job)

    summaries: dict[str, dict] = {}

    for company, company_jobs in by_company.items():
        building_jobs = [j for j in company_jobs if j.get("category") in ("engineering", "research")]
        selling_jobs  = [j for j in company_jobs if j.get("category") == "sales_gtm"]

        if not building_jobs and not selling_jobs:
            continue

        # Seed result from existing summaries so we can extend rather than replace
        existing = (existing_summaries or {}).get(company, {})
        result: dict = {
            "building": existing.get("building", []),
            "selling":  existing.get("selling", []),
        }

        skip_building_selling = only_new_sections and bool(existing.get("building") or existing.get("selling"))

        print(f"\n  [summarizer] {company}: {len(building_jobs)} building + {len(selling_jobs)} selling"
              + (" (skipping build/sell — using existing)" if skip_building_selling else ""))

        # ── Building ─────────────────────────────────────────────────────────
        if building_jobs and not skip_building_selling:
            b_lines = _format_lines(building_jobs, max_jobs=80)

            print(f"    → generating building bullets (Opus)...")
            draft = _generate(client, BUILDING_PROMPT.format(
                company=company, count=len(building_jobs), job_lines=b_lines,
            ), company, "building")
            time.sleep(1)

            print(f"    → verifying + revising {len(draft)} bullets...")
            result["building"] = _verify_and_revise(client, company, "building", b_lines, draft)
            time.sleep(0.5)

        # ── Selling ──────────────────────────────────────────────────────────
        if selling_jobs and not skip_building_selling:
            s_lines = _format_lines(selling_jobs, max_jobs=50)

            print(f"    → generating selling bullets (Opus)...")
            draft = _generate(client, SELLING_PROMPT.format(
                company=company, count=len(selling_jobs), job_lines=s_lines,
            ), company, "selling")
            time.sleep(1)

            print(f"    → verifying + revising {len(draft)} bullets...")
            result["selling"] = _verify_and_revise(client, company, "selling", s_lines, draft)
            time.sleep(0.5)

        # ── Verticals ────────────────────────────────────────────────────────
        VERTICALS = {
            "health_rd":       "Health R&D",
            "health_delivery": "Health Delivery",
            "agriculture":     "Agriculture",
            "education":       "Education",
        }

        if not regenerate_verticals and existing.get("vertical_bullets") is not None:
            result["vertical_bullets"] = existing["vertical_bullets"]
            print(f"    → vertical bullets: using existing (pass regenerate_verticals=True to redo)")
        else:
            result["vertical_bullets"] = {}
            for v_key, v_label in VERTICALS.items():
                v_jobs = [j for j in company_jobs if j.get("vertical") == v_key]
                if not v_jobs:
                    result["vertical_bullets"][v_key] = []
                    continue

                v_lines = _format_lines(v_jobs, max_jobs=40)
                print(f"    → generating {v_label} vertical bullets ({len(v_jobs)} jobs, Opus)...")
                draft = _generate(client, VERTICAL_PROMPT.format(
                    company=company, count=len(v_jobs),
                    vertical_label=v_label, job_lines=v_lines,
                ), company, f"vertical_{v_key}")
                time.sleep(1)

                print(f"    → verifying + revising {len(draft)} {v_label} bullets...")
                result["vertical_bullets"][v_key] = _verify_and_revise(
                    client, company, f"{v_label} vertical", v_lines, draft
                )
                time.sleep(0.5)

        # ── Social Impact ─────────────────────────────────────────────────────
        if only_new_sections and existing.get("social_impact_bullets") is not None:
            result["social_impact_bullets"] = existing["social_impact_bullets"]
            print(f"    → social impact bullets: using existing")
        else:
            si_jobs = [j for j in company_jobs if j.get("social_impact") is True]
            result["social_impact_bullets"] = []
            if si_jobs:
                si_lines = _format_lines(si_jobs, max_jobs=40)
                print(f"    → generating social impact bullets ({len(si_jobs)} jobs, Opus)...")
                draft = _generate(client, SOCIAL_IMPACT_PROMPT.format(
                    company=company, count=len(si_jobs), job_lines=si_lines,
                ), company, "social_impact")
                time.sleep(1)

                print(f"    → verifying + revising {len(draft)} social impact bullets...")
                result["social_impact_bullets"] = _verify_and_revise(
                    client, company, "social impact", si_lines, draft
                )
                time.sleep(0.5)

        summaries[company] = result

    return summaries
