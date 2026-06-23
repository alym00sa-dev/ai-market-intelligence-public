"""
Standalone entrypoint for the category/theme classifier.

Classification normally runs inside scraper.py (Stage 2). This runner lets the
classify step be re-run on its own — e.g. after an overnight `scraper.py
--no-classify` scrape — without re-scraping. It loads the raw jobs, runs
classify_jobs() (Haiku), and writes the enriched jobs back out.

Usage:
  python run_classifier.py --input staging/<date>/jobs_raw.json --output staging/<date>/jobs.json
  python run_classifier.py --input staging/<date>/jobs.json          # in-place
"""

import argparse
import json
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

from classifier import classify_jobs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=str, required=True, help="Path to jobs_raw.json (or jobs.json)")
    parser.add_argument("--output", type=str, default=None, help="Where to write enriched jobs (default: overwrite --input)")
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output) if args.output else in_path

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set")

    with open(in_path) as f:
        data = json.load(f)

    jobs = data["jobs"]
    print(f"Loaded {len(jobs)} jobs from {in_path.name}")

    classified = classify_jobs(jobs)
    data["jobs"] = classified
    data["total_jobs"] = len(classified)

    # Refresh the per-company category rollup so the dashboard's company cards
    # reflect the freshly-classified categories rather than stale/empty ones.
    companies: dict = {}
    for job in classified:
        co = job["company"]
        companies.setdefault(co, {"total": 0, "by_category": {}})
        companies[co]["total"] += 1
        cat = job.get("category") or "unclassified"
        companies[co]["by_category"][cat] = companies[co]["by_category"].get(cat, 0) + 1
    data["companies"] = companies

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Saved classified jobs to {out_path}")


if __name__ == "__main__":
    main()
