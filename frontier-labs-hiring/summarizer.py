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
import re
import time
from collections import Counter

import anthropic

GENERATE_MODEL = "claude-opus-4-6"
VERIFY_MODEL   = "claude-sonnet-4-6"
REVISE_MODEL   = "claude-opus-4-6"

# ── Stage 1: Generate ─────────────────────────────────────────────────────────

# Shared style contract — applied to every narrative section. The goal is SIGNALS:
# what the company is plausibly doing and where it may be heading, inferred from what
# the roles are *for* (their descriptions) — NOT a headcount readout, and NOT
# overconfident prophecy.
_STYLE = """\
Each bullet states what the hiring data OBSERVABLY shows, and teases the signal out of \
those facts. Grounded and checkable — not speculation, not prophecy, not hedging.
- GROUND every claim in the postings themselves — role types, focus areas, scale, \
  notable combinations. If you couldn't point to the specific roles that prove it, do \
  not write it. Read the DESCRIPTIONS, not just titles.
- TEASE OUT THE SIGNAL: don't merely list which teams exist — make the striking pattern \
  salient. What is unusually concentrated, unusually broad, an unexpected combination, \
  built in-house vs. outsourced, or newly present? Name what's notable about the makeup, \
  drawn from the facts.
- Do NOT hedge with "suggests / appears / points to / likely / consistent with" — those \
  read as unverifiable. State plainly what the roles show. And do NOT editorialize into \
  claims about strategy, intent, or the future that a reader couldn't check against the \
  postings ("this means they'll dominate…", "a bet that…"). Let the signal stand on the facts.
- ONE signal per bullet — one idea. A brief grounded list that supports it is fine.
- ANCHOR each bullet with the number of roles (or scale) behind the signal, so its \
  weight is clear — e.g. "10+ roles", "a handful of roles", "just two hires", "a single \
  role". Use the counts from the theme tally / the roles you're citing; this is how the \
  reader gauges importance. Counts support the signal — they are not the headline.
- Plain, accessible language. No markdown, no "Theme:" labels. ~30–40 words."""


BUILDING_PROMPT = """\
You are a market-intelligence analyst reading hiring signals. Below are {count} \
engineering/research roles at {company}, each as "title: what they do | desc: …". \
Read the DESCRIPTIONS closely — the signal is in what the work is actually for.

For light context, a tally of the capability themes these roles map to (use it only to \
orient yourself on where the concentration sits — do NOT recite these counts):
{theme_summary}

ROLES:
{job_lines}

Write 5–7 bullets on what {company} is building or researching, and the signal in the \
makeup of those roles.
{style}

Output ONLY a plain bullet list. Examples of the tone (grounded + signal teased + role count anchored, no hedging — NOT the content):
- Reinforcement learning is the most heavily staffed area — 10+ roles spanning velocity tooling, performance, training environments, and cybersecurity — reaching well beyond alignment tuning into core capability work.
- A dozen data-center electrical, mechanical, and cooling engineering roles are building physical compute in-house, rather than only renting capacity from cloud partners.
- Interpretability and honesty sit apart from product-safety work as a narrow bench of just two roles — a dedicated line on understanding model internals, separate from shipping guardrails."""

SELLING_PROMPT = """\
You are a market-intelligence analyst reading hiring signals. Below are {count} \
sales/go-to-market roles at {company}, each as "title: what they sell/drive | desc: …". \
Read the DESCRIPTIONS — the signal is who they're really selling to and how.

{job_lines}

Write 4–6 bullets on what {company} is selling, to whom, and through what motion — and \
the signal in it. Isolate one product, segment, motion, or geography per bullet.
{style}

Output ONLY a plain bullet list. Examples of the tone (grounded + signal teased + role count anchored, no hedging — NOT the content):
- A dedicated bench of 8+ federal, defense, and state/local account executives staffs the public sector as a core market here — not handled opportunistically through general enterprise sales.
- Solutions architects and applied-AI engineers are hired alongside account executives across a dozen+ roles, pairing technical deployment support with deals — an integration-led motion, not transactional selling.
- Five French-, German-, and Spanish-speaking account executives staff an active EMEA build-out, selling to EU enterprise buyers in their local markets."""


VERTICAL_PROMPT = """\
You are a market-intelligence analyst reading hiring signals. Below are {count} roles \
at {company} focused specifically on the {vertical_label} vertical, each as \
"title: what they build or sell".

{job_lines}

Write UP TO 3 bullets on what is being built, sold, or deployed in {vertical_label}. \
Only write a bullet if the roles genuinely support a distinct insight — 1 strong bullet \
beats 3 weak ones. Do NOT start with "{company}".
{style}

Output ONLY a plain bullet list.\
"""

SOCIAL_IMPACT_PROMPT = """\
You are a market-intelligence analyst. Below are {count} roles at {company} flagged as \
social impact — work whose primary beneficiary is the public, a public institution, or \
an underserved community. This spans traditional social impact (policy, civic tech, \
humanitarian, public health/education access) AND beneficial-AI deployment (nonprofit/NGO \
partnerships, academic programs, government-as-beneficiary) where the explicit purpose is \
societal benefit over revenue.

{job_lines}

Write 2–3 bullets on the dominant thrust — what {company} is doing and who benefits.
{style}

Output ONLY a plain bullet list.\
"""


SHIFT_PROMPT = """\
You are a market-intelligence analyst tracking how a frontier AI lab's hiring \
focus is SHIFTING week over week. Read the data and call the directional signal.

Company: {company}
Window: last week ({prev_week}) → this week ({curr_week})
Net role change: +{new} opened, −{removed} closed.

Capability-theme momentum (role-count change this week — "new" opened minus "closed"):
{theme_delta_block}

A sample of the NEW roles opened this week (title — what — theme):
{new_roles_block}

Write 1–2 short bullets naming where {company} is shifting hiring emphasis —
toward and/or away from which capabilities — grounded ONLY in the data above.
- Lead with the strongest directional signal (biggest theme swings).
- Name the specific themes (e.g. "leaning into reasoning and post-training RL while
  pulling back on trust & safety").
- If the week's change is small or noisy, say so plainly in ONE line — do not
  manufacture a trend.
- Do NOT invent products, numbers, or specifics not present above. 20–30 words each.

Output ONLY a plain bullet list, nothing else.\
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

def _has_what(j: dict) -> bool:
    w = j.get("what") or ""
    return bool(w) and not w.startswith("Classification failed")


def _format_lines(jobs: list[dict], max_jobs: int, desc_chars: int = 240) -> str:
    """One line per role: title + the distilled `what` + a description snippet.

    The description snippet is what lets the analyst infer what the work is actually
    FOR (the signal), so we include it alongside the one-line `what`. `what`-bearing
    roles are listed first so they survive the max_jobs cut.
    """
    ordered = sorted(jobs, key=lambda j: not _has_what(j))[:max_jobs]

    lines = []
    for j in ordered:
        line = f"- {j.get('title', '')}"
        if _has_what(j):
            line += f": {j['what']}"
        desc = (j.get("description") or "").replace("\n", " ").strip()
        if desc:
            line += f" | desc: {desc[:desc_chars]}"
        lines.append(line)
    return "\n".join(lines)


def _theme_summary(jobs: list[dict]) -> str:
    """Compact 'label: count' tally of primary themes, ranked, for prompt grounding.

    Returns a placeholder line when theme data isn't present yet (pre-reclassify),
    so the prompt still works against older jobs.json files.
    """
    counts = Counter(j["theme"] for j in jobs if j.get("theme"))
    if not counts:
        return "  (theme data not yet available — ground bullets in the role list below)"
    return "\n".join(f"  {THEME_LABELS.get(t, t)}: {n}" for t, n in counts.most_common())


def _parse_bullets(text: str) -> list[str]:
    bullets = []
    for line in text.splitlines():
        if not line.strip().startswith(("-", "•", "*")):
            continue
        b = line.lstrip("-•* ").strip()
        # Strip leftover markdown emphasis (e.g. a bolded lead-in: "**Leaning in:**")
        b = b.replace("**", "").replace("__", "")
        b = re.sub(r"\s+", " ", b).strip()
        if b:
            bullets.append(b)
    return bullets


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


# ── Shift narrative (week-over-week hiring-focus signal) ─────────────────────

# Friendly labels for the controlled theme vocabulary (keep in sync with classifier.THEMES).
THEME_LABELS = {
    "foundation_pretraining": "pretraining", "post_training_rl": "post-training/RL",
    "reasoning": "reasoning", "multimodal": "multimodal", "agents_tool_use": "agents/tool-use",
    "interpretability": "interpretability", "alignment_safety": "alignment & safety",
    "evals_red_teaming": "evals/red-teaming", "security_misuse": "security/misuse",
    "biosecurity_cbrn": "biosecurity/CBRN", "robotics_embodied": "robotics/embodied",
    "training_infra_compute": "training infra/compute", "inference_serving": "inference/serving",
    "data_pipeline": "data pipeline", "product_app_layer": "product/app layer",
    "developer_platform": "developer platform",
}


def _theme_delta_block(curr: dict, prev: dict) -> tuple[str, bool]:
    """Build a human-readable theme-momentum block from two weeks' theme dists.

    Returns (text, has_signal). has_signal is False when nothing moved.
    """
    curr_t = (curr.get("new_dist", {}).get("theme", {}))
    rem_t  = (curr.get("removed_dist", {}).get("theme", {}))
    keys = set(curr_t) | set(rem_t)
    rows = []
    for k in keys:
        net = curr_t.get(k, 0) - rem_t.get(k, 0)
        if net == 0:
            continue
        label = THEME_LABELS.get(k, k)
        rows.append((net, f"  {label}: {'+' if net > 0 else ''}{net} (opened {curr_t.get(k,0)}, closed {rem_t.get(k,0)})"))
    rows.sort(key=lambda r: -abs(r[0]))
    if not rows:
        return "  (no net theme movement)", False
    return "\n".join(r[1] for r in rows), True


def generate_shift_narratives(
    client: anthropic.Anthropic,
    jobs: list[dict],
    trends: dict,
) -> dict[str, list[str]]:
    """Per-company 1–2 bullet narrative on week-over-week hiring-focus shifts.

    Reads the latest two weeks of weekly_trends.json. Returns {company: [bullets]}.
    Skips the baseline week (no prior to compare) and companies with no net change.
    """
    weeks = trends.get("weeks", [])
    if len(weeks) < 2:
        print("  [shift] <2 weeks of trends or baseline only — skipping shift narratives.")
        return {}

    curr, prev = weeks[-1], weeks[-2]
    curr_week, prev_week = curr.get("week", "?"), prev.get("week", "?")

    # New-role examples per company (from this run's is_new jobs).
    new_by_company: dict[str, list[dict]] = {}
    for j in jobs:
        if j.get("is_new"):
            new_by_company.setdefault(j.get("company", ""), []).append(j)

    out: dict[str, list[str]] = {}
    for company, stats in curr.get("by_company", {}).items():
        new_n = stats.get("new", 0)
        removed_n = stats.get("removed", 0)
        if new_n == 0 and removed_n == 0:
            continue

        prev_stats = prev.get("by_company", {}).get(company, {})
        delta_block, has_signal = _theme_delta_block(stats, {"dist": prev_stats.get("dist", {})})

        new_lines = []
        for j in (new_by_company.get(company, [])[:25]):
            theme = j.get("theme") or "—"
            what = (j.get("what") or "")[:90]
            new_lines.append(f"  - {j.get('title','')[:50]} — {what} — [{theme}]")
        new_block = "\n".join(new_lines) if new_lines else "  (none)"

        prompt = SHIFT_PROMPT.format(
            company=company, prev_week=prev_week, curr_week=curr_week,
            new=new_n, removed=removed_n,
            theme_delta_block=delta_block, new_roles_block=new_block,
        )
        bullets = _generate(client, prompt, company, "shift")
        if bullets:
            out[company] = bullets
            print(f"  [shift] {company}: {len(bullets)} bullet(s)")

    return out


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
                theme_summary=_theme_summary(building_jobs), style=_STYLE,
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
                company=company, count=len(selling_jobs), job_lines=s_lines, style=_STYLE,
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
                    vertical_label=v_label, job_lines=v_lines, style=_STYLE,
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
                    company=company, count=len(si_jobs), job_lines=si_lines, style=_STYLE,
                ), company, "social_impact")
                time.sleep(1)

                print(f"    → verifying + revising {len(draft)} social impact bullets...")
                result["social_impact_bullets"] = _verify_and_revise(
                    client, company, "social impact", si_lines, draft
                )
                time.sleep(0.5)

        summaries[company] = result

    return summaries
