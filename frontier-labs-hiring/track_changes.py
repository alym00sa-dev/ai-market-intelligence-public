"""Weekly job change tracking.

Runs as the FINAL pipeline step, after scrape + category classification
(scraper.py), vertical/social tagging (vertical_classifier.py) and company
summaries (run_summarizer.py) have all written to jobs.json.

It diffs the current jobs.json against a persistent ledger of every job ID ever
seen, then:
  * stamps each job with first_seen / last_seen / is_new
  * detects removed jobs (in the ledger + active, but gone from this run)
  * appends a per-week rollup to weekly_trends.json (new / removed / totals,
    broken down by company, vertical and social impact)
  * archives a slim, gzipped full snapshot under snapshots/

Idempotent: re-running for the same week overwrites that week's trend row and
snapshot rather than double-counting.

Usage:
    python track_changes.py
    python track_changes.py --data-dir /path/to/public/data
"""

import argparse
import gzip
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR     = Path(__file__).parent.parent / "public" / "data"
JOBS_NAME    = "jobs.json"
LEDGER_NAME  = "job_ledger.json"
TRENDS_NAME  = "weekly_trends.json"
SNAP_DIR     = "snapshots"

# Fields kept in the gzipped weekly snapshot (descriptions dropped — only needed
# transiently for classification, and they dominate the file size).
SNAPSHOT_FIELDS = [
    "id", "company", "title", "department", "location", "url", "source",
    "category", "sub_area", "theme", "themes_secondary", "vertical",
    "social_impact", "first_seen", "is_new",
]


def _load_json(path: Path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _week_of(jobs_data: dict) -> str:
    """Week key = the scrape date (YYYY-MM-DD), from jobs.json scraped_at."""
    raw = jobs_data.get("scraped_at")
    if raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            pass
    return datetime.now(timezone.utc).date().isoformat()


# Composition dimensions captured per week. Recording the *mix* (not just totals)
# every week gives the hiring-focus-shift analysis a historical series to work
# against — it can't be backfilled. `theme` (primary capability/agenda) is the key
# strategic-signal axis; secondary themes are kept on the job but not trended here.
DIMENSIONS = ["category", "sub_area", "vertical", "theme"]


def _empty_company_stat() -> dict:
    return {
        "total": 0,
        "new": 0,
        "removed": 0,
        "social_impact": 0,
        "new_social_impact": 0,
        "dist": {dim: defaultdict(int) for dim in DIMENSIONS},          # composition of all current roles
        "new_dist": {dim: defaultdict(int) for dim in DIMENSIONS},      # composition of just the new roles
        "removed_dist": {dim: defaultdict(int) for dim in DIMENSIONS},  # composition of the roles that disappeared
    }


def _finalize_stats(stats: dict) -> dict:
    """Convert defaultdicts to plain dicts for JSON serialization."""
    out = {}
    for company, s in stats.items():
        out[company] = {
            "total": s["total"],
            "new": s["new"],
            "removed": s["removed"],
            "social_impact": s["social_impact"],
            "new_social_impact": s["new_social_impact"],
            "dist": {dim: dict(s["dist"][dim]) for dim in DIMENSIONS},
            "new_dist": {dim: dict(s["new_dist"][dim]) for dim in DIMENSIONS},
            "removed_dist": {dim: dict(s["removed_dist"][dim]) for dim in DIMENSIONS},
        }
    return out


def track(data_dir: Path) -> dict:
    jobs_path   = data_dir / JOBS_NAME
    ledger_path = data_dir / LEDGER_NAME
    trends_path = data_dir / TRENDS_NAME

    jobs_data = _load_json(jobs_path, None)
    if jobs_data is None:
        raise SystemExit(f"track_changes: {jobs_path} not found — run the scraper first.")

    ledger = _load_json(ledger_path, {})
    is_baseline = len(ledger) == 0
    week = _week_of(jobs_data)
    jobs = jobs_data.get("jobs", [])
    current_ids = {j["id"] for j in jobs}

    # ── Diff each current job against the ledger ──────────────────────────────
    by_company = defaultdict(_empty_company_stat)
    totals = _empty_company_stat()

    for job in jobs:
        jid = job["id"]
        company = job.get("company", "Unknown")
        vertical = job.get("vertical")
        social = bool(job.get("social_impact"))

        prior = ledger.get(jid)
        if prior:
            first_seen = prior.get("first_seen", week)
            is_new = False
        else:
            first_seen = week
            is_new = not is_baseline  # baseline run never claims "new"

        job["first_seen"] = first_seen
        job["last_seen"]  = week
        job["is_new"]     = is_new

        ledger[jid] = {
            "first_seen": first_seen,
            "last_seen": week,
            "company": company,
            "category": job.get("category"),
            "sub_area": job.get("sub_area"),
            "theme": job.get("theme"),
            "vertical": vertical,
            "social_impact": social,
            "active": True,
        }

        # Roll up stats for this (still-present) job.
        for scope in (by_company[company], totals):
            scope["total"] += 1
            if social:
                scope["social_impact"] += 1
            for dim in DIMENSIONS:
                val = job.get(dim)
                if val:
                    scope["dist"][dim][val] += 1
            if is_new:
                scope["new"] += 1
                if social:
                    scope["new_social_impact"] += 1
                for dim in DIMENSIONS:
                    val = job.get(dim)
                    if val:
                        scope["new_dist"][dim][val] += 1

    # ── Detect removed jobs (active in ledger, absent this run) ───────────────
    removed_count = 0
    for jid, entry in ledger.items():
        if entry.get("active") and jid not in current_ids:
            entry["active"] = False
            removed_count += 1
            company = entry.get("company", "Unknown")
            for scope in (by_company[company], totals):
                scope["removed"] += 1
                for dim in DIMENSIONS:
                    val = entry.get(dim)
                    if val:
                        scope["removed_dist"][dim][val] += 1

    # ── Append / overwrite this week's trend row ──────────────────────────────
    trends = _load_json(trends_path, {"weeks": []})
    week_row = {
        "week": week,
        "baseline": is_baseline,
        "by_company": _finalize_stats(by_company),
        "totals": _finalize_stats({"__all__": totals})["__all__"],
    }
    trends["weeks"] = [w for w in trends.get("weeks", []) if w.get("week") != week]
    trends["weeks"].append(week_row)
    trends["weeks"].sort(key=lambda w: w["week"])

    # ── Write everything ──────────────────────────────────────────────────────
    jobs_data["tracking"] = {
        "week": week,
        "baseline": is_baseline,
        "new": totals["new"],
        "removed": removed_count,
        "total": totals["total"],
    }
    with open(jobs_path, "w") as f:
        json.dump(jobs_data, f, indent=2)
    with open(ledger_path, "w") as f:
        json.dump(ledger, f, indent=2)
    with open(trends_path, "w") as f:
        json.dump(trends, f, indent=2)
    _write_snapshot(data_dir / SNAP_DIR, week, jobs)

    print(
        f"[track_changes] week={week} baseline={is_baseline} "
        f"total={totals['total']} new={totals['new']} removed={removed_count} "
        f"ledger_size={len(ledger)}",
        flush=True,
    )
    return week_row


def _write_snapshot(snap_dir: Path, week: str, jobs: list[dict]) -> None:
    snap_dir.mkdir(parents=True, exist_ok=True)
    slim = [{k: j.get(k) for k in SNAPSHOT_FIELDS} for j in jobs]
    payload = {"week": week, "total_jobs": len(slim), "jobs": slim}
    out = snap_dir / f"jobs-{week}.json.gz"
    with gzip.open(out, "wt", encoding="utf-8") as f:
        json.dump(payload, f)
    print(f"[track_changes] snapshot → {out} ({len(slim)} jobs)", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=str, default=None, help="Override public/data dir")
    args = parser.parse_args()
    data_dir = Path(args.data_dir) if args.data_dir else DATA_DIR
    track(data_dir)


if __name__ == "__main__":
    main()
