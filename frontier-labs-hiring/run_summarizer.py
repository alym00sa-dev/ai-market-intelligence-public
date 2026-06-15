"""
Standalone entrypoint for the summarizer.

Loads jobs.json (after vertical + social tagging), runs summarize_companies()
to produce building/selling/vertical_bullets/social_impact_bullets, and writes
the result back to jobs.json.

Usage:
  python run_summarizer.py
  python run_summarizer.py --input path/to/jobs.json
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

import anthropic

from summarizer import summarize_companies, generate_shift_narratives

JOBS_PATH   = Path(__file__).parent.parent / "public" / "data" / "jobs.json"
TRENDS_PATH = Path(__file__).parent.parent / "public" / "data" / "weekly_trends.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=str, default=None)
    args = parser.parse_args()

    path = Path(args.input) if args.input else JOBS_PATH

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set")

    with open(path) as f:
        data = json.load(f)

    jobs = data["jobs"]
    print(f"Loaded {len(jobs)} jobs from {path.name}")

    summaries = summarize_companies(jobs)

    # Week-over-week shift narrative — needs the trends file written by
    # track_changes.py (which must run before this step). Merged per company.
    try:
        with open(TRENDS_PATH) as f:
            trends = json.load(f)
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        shifts = generate_shift_narratives(client, jobs, trends)
        for company, bullets in shifts.items():
            summaries.setdefault(company, {})["shift"] = bullets
    except FileNotFoundError:
        print(f"  [shift] {TRENDS_PATH.name} not found — run track_changes.py first; skipping shift narratives.")

    data["company_summaries"] = summaries

    with open(path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Saved summaries to {path}")


if __name__ == "__main__":
    main()
