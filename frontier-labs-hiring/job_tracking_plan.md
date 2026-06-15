# Job Change Tracking — Implementation Plan

## Objective
Each weekly scrape diffs against prior state to flag **new** and **removed** jobs,
accumulates a **week-by-week trends** time series, archives a **full weekly snapshot**,
and feeds a redesigned company-profiles view.

## Decisions locked in
- Track **new + removed** jobs.
- Keep **full weekly snapshots** (stored slim + gzipped — see Phase 1 note on size).

---

## Phase 0 — Prerequisite: deterministic job IDs *(blocker — must land first)*
The diff is worthless if IDs aren't stable run-to-run.
1. **Amazon** (`sources/html_scraper.py::_amazon_job`): derive ID from `job_path`
   (stable numeric segment) or `id_icims` instead of falling through to a random UUID.
2. **`scraper.py` fallback**: replace `job.get("id") or str(uuid.uuid4())` with a
   deterministic content hash — `sha1(url or f"{company}|{title}|{location}")[:16]`.
   Guarantees nothing is ever random.
3. **Document one-time baseline churn**: NVIDIA + ByteDance IDs changed format when
   those scrapers were rewritten, so the first run shows them as all-new. Expected.

## Phase 1 — Data model (4 artifacts in `public/data/`)

**1. `jobs.json`** (existing) — add per-job fields: `first_seen`, `last_seen`, `is_new`.

**2. `job_ledger.json`** (new, persistent memory — source of truth)
```json
{ "ashby-openai-8fb1…": {
    "first_seen": "2026-06-25", "last_seen": "2026-07-02",
    "company": "OpenAI", "category": "research",
    "vertical": "health_rd", "social_impact": true, "active": true } }
```
> Stores each job's classification tags, because a removed job is no longer in
> `jobs.json` yet we still need its company/vertical/social to attribute removals.

**3. `weekly_trends.json`** (new, append-only — "row per week")
```json
{ "weeks": [
  { "week": "2026-07-02", "baseline": false,
    "by_company": { "OpenAI": {
        "total": 729, "new": 34, "removed": 12,
        "by_vertical": { "health_rd": 8, "education": 3 },
        "new_by_vertical": { "health_rd": 2 },
        "social_impact": 18, "new_social_impact": 2 } },
    "totals": { "total": 15000, "new": 600, "removed": 200,
                "by_vertical": {}, "social_impact": 400 } } ] }
```

**4. `snapshots/jobs-YYYY-MM-DD.json.gz`** (new, full weekly archive)
> Full weekly snapshot, stored **without descriptions** (only needed transiently for
> classification) and **gzipped**: ~29 MB → ~2-3 MB raw → ~300-500 KB gzipped.
> ~52/year ≈ 20 MB/year instead of 1.5 GB/year.

## Phase 2 — Diff pipeline
New script **`track_changes.py`**, run as the **final pipeline step** (after
`scraper.py` → `vertical_classifier.py` → `run_summarizer.py`, so vertical/social
tags exist):
1. Load `job_ledger.json` (empty ⇒ **baseline run**: `is_new=false`, `new=0`, `baseline:true`).
2. For each current job: in ledger ⇒ carry `first_seen`, `is_new=false`; else ⇒
   `first_seen=run_date`, `is_new=true`, add to ledger. Update `last_seen`, tags, `active=true`.
3. **Removed** = ledger entries `active=true` absent from the current set ⇒ flip
   `active=false`; count by company/vertical/social using stored tags.
4. Compute per-company + total stats (total / new / removed / by_vertical /
   new_by_vertical / social_impact / new_social_impact).
5. Append the `week` object to `weekly_trends.json` (idempotent: re-running the same
   week overwrites that week).
6. Write slim+gzipped snapshot, updated `jobs.json`, `job_ledger.json`.

**Workflow** (`refresh-hiring.yml`): add the `track_changes.py` step and `git add`
the new files (`job_ledger.json`, `weekly_trends.json`, `snapshots/`).

## Phase 2.5 — Analysis layer ✅ IMPLEMENTED (pipeline side)
**Locked decisions:** themes = primary + up to 2 secondary (controlled vocab of 16);
freeform `tags` **dropped entirely** (3.5k uncontrolled strings, 53% single-use,
644 case/separator collisions — unusable for trends); shift narrative = **yes**.
Classifier stays on **Haiku 4.5** (live-tested, theme quality is strong).

Built & validated:
- `classifier.py` — emits `theme` + `themes_secondary` (16-term controlled vocab),
  richer `what`, drops `tags`; sanitizer coerces to vocab. Live-tested on 28 real jobs.
- `track_changes.py` — `theme` added to `DIMENSIONS`; records `dist` / `new_dist` /
  `removed_dist`; ledger stores theme/sub_area for removed attribution. Tested:
  correctly produced `removed:{biosecurity_cbrn}` / `new:{foundation_pretraining}`.
- `summarizer.py` — `generate_shift_narratives()` + `SHIFT_PROMPT`; per-company 1–2
  bullets from theme momentum + new-role samples. Live-tested; hedges noise correctly.
- `run_summarizer.py` — loads `weekly_trends.json`, merges `shift` per company.
- Workflow reordered: scraper → vertical_classifier → **track_changes → run_summarizer**.

Also redesigned the **narrative bullet prompts** (building/selling/vertical/social):
- Shared `_STYLE` contract → bullets are **signals, not headcounts**: lead with the
  strategic read, ground it in what roles are *for* (descriptions), counts optional.
- **Calibrated** — inference framed as inference ("suggests/points to/appears"), no
  overconfident prophecy. Depth kept (~25–40 words) per user preference.
- `_format_lines` now feeds a description snippet (not just the one-line `what`).
- Building prompt gets a theme tally as orientation context (not to recite).
- Validated live on Anthropic — clear before/after improvement.

Remaining for later (UI side, Phase 3/4): remove `tags` from the `Job` TS type +
components; render `theme` + shift narrative. **Also pending: a full pipeline re-run**
to regenerate jobs.json with themes + new bullets (heavy: re-classify ~15k jobs +
re-summarize) — best done when landing on `main`.

### (original Phase 2.5 design notes)
*The qualitative counterpart to the volume tracking above. Distinguishes the
**composition / intent signal** (what kind of work a lab is hiring for, and how that
mix shifts) from the **volume signal** (how many roles). Goal: surface material
shifts — e.g. "biosecurity hiring 12% → 3% while pretraining 5% → 18%" — without
over-indexing on noise.*

Two parts:

**(a) Rethink the three prompt surfaces** that shape how we read/narrate jobs:
- `classifier.py` — category / sub_area / tags / the `what` one-liner.
- `vertical_classifier.py` — vertical + social_impact.
- `summarizer.py` — the building/selling bullets + vertical/social bullets shown on
  the company profiles (what a reader actually perceives as "the signal").
Add a strategically-meaningful **research-theme / capability** dimension (e.g.
pretraining, RL, alignment/safety, biosecurity, interpretability, multimodal,
agents, robotics) designed for signal-reading, not just bucketing.

**(b) Composition-shift detection + analyst narrative:**
- Week-over-week deltas in the `dist` block (already being recorded — see note below).
- Add the new `theme` dimension to `DIMENSIONS` in `track_changes.py` once it's emitted.
- Optional per-lab "what changed & what it might signal" analyst note (LLM pass over
  the week's new/removed jobs + distribution deltas).

> **Already in place (done in Phase 2):** `track_changes.py` records the full
> composition mix per week — `dist` and `new_dist` over category / sub_area / vertical
> — because this history can't be backfilled. The `theme` dimension slots into the
> same structure later.

## Phase 3 — Dashboard data + types
- New TS types in `app/types.ts`: `WeeklyTrends`, `WeekRow`, `CompanyWeekStats`;
  extend `Job` with `first_seen` / `is_new`.
- Load `weekly_trends.json` in the profiles route.

## Phase 4 — Company profiles redo (UX — detail separately)
- "NEW this week" badges (from `is_new`) + a "What changed" list (new + removed) per company.
- Per-company week-over-week deltas / sparklines from `weekly_trends.json`.
- Optional dedicated **Trends** tab = the week × company table.

## Edge cases handled
- **Baseline** first run (no newness claims). **Re-runs same week** overwrite.
- **Reopened roles** (removed then reappear) flip `active` back true, keep original `first_seen`.
- **Removed-job attribution** via tags stored in the ledger.

## Risks / open items
- Snapshot bloat → mitigated by slim+gzip.
- All new files must land on **`main`** for scheduled CI to maintain the ledger.
- First post-deploy run over-reports "new" for NVIDIA/ByteDance (ID format change).
