"""
Main scraper entry point.

Usage:
    python scraper.py                  # scrape all companies + classify
    python scraper.py --no-classify    # scrape only, skip Claude classification
    python scraper.py --company openai # scrape a single company by name

Output:
    ../ai-market-intelligence-dashboard/public/data/jobs.json
"""

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


def checkpoint(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"\n[{ts}] ── {msg} ──", flush=True)

from dotenv import load_dotenv

# Load ANTHROPIC_API_KEY from project root .env
ROOT_ENV = Path(__file__).parent.parent / ".env"
load_dotenv(ROOT_ENV)

from config import COMPANIES
from classifier import classify_jobs
from summarizer import summarize_companies
import sources.greenhouse as greenhouse
import sources.lever as lever
import sources.ashby as ashby
import sources.workday as workday
import sources.html_scraper as html_scraper
import sources.playwright_scraper as playwright_scraper

OUTPUT_PATH = Path(__file__).parent.parent / "public" / "data" / "jobs.json"


def scrape_company(company: dict) -> list[dict]:
    name = company["name"]
    source = company["source"]
    print(f"\n[{name}] scraping via {source}...")

    raw_jobs = []
    try:
        if source == "greenhouse":
            raw_jobs = greenhouse.fetch_jobs(company["board_id"], eu=company.get("eu", False))
        elif source == "lever":
            raw_jobs = lever.fetch_jobs(company["board_id"])
        elif source == "ashby":
            raw_jobs = ashby.fetch_jobs(company["board_id"])
        elif source == "workday":
            raw_jobs = workday.fetch_jobs(company["tenant"], company["board"])
        elif source == "playwright":
            raw_jobs = playwright_scraper.fetch_jobs(company["scraper"], company.get("ai_filter", []))
        elif source == "html":
            raw_jobs = html_scraper.fetch_jobs(company["scraper"], company.get("ai_filter", []))
        else:
            print(f"  Unknown source: {source}")
            return []
    except Exception as e:
        print(f"  ERROR scraping {name}: {e}")
        return []

    # Attach company name + stable ID prefix to each job
    jobs = []
    for job in raw_jobs:
        job_id = job.get("id") or str(uuid.uuid4())
        jobs.append({
            "id": f"{source}-{name.lower().replace(' ', '-')}-{job_id}",
            "company": name,
            "title": job.get("title", "").strip(),
            "department": job.get("department", "").strip(),
            "location": job.get("location", "").strip(),
            "url": job.get("url", ""),
            "source": source,
            "description": job.get("description", ""),
            # Classification fields — filled in later
            "category": None,
            "sub_area": None,
            "what": None,
            "tags": [],
        })

    # Drop blank titles
    jobs = [j for j in jobs if j["title"]]
    print(f"  Found {len(jobs)} jobs.")
    return jobs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-classify", action="store_true", help="Skip Claude classification")
    parser.add_argument("--no-summarize", action="store_true", help="Skip company-level LLM summarization")
    parser.add_argument("--company", type=str, default=None, help="Scrape a single company by name")
    parser.add_argument("--output", type=str, default=None, help="Override output path (default: dashboard public/data/jobs.json)")
    args = parser.parse_args()

    global OUTPUT_PATH
    if args.output:
        OUTPUT_PATH = Path(args.output)
        print(f"Output → {OUTPUT_PATH}")

    # Select companies to scrape
    companies = COMPANIES
    if args.company:
        companies = [c for c in COMPANIES if c["name"].lower() == args.company.lower()]
        if not companies:
            print(f"Company '{args.company}' not found. Available: {[c['name'] for c in COMPANIES]}")
            sys.exit(1)

    # ── Stage 1: Scrape ───────────────────────────────────────────────────────
    checkpoint(f"STAGE 1/4 — SCRAPING ({len(companies)} companies)")
    all_jobs = []
    for i, company in enumerate(companies, 1):
        print(f"\n  [{i}/{len(companies)}] {company['name']}...", flush=True)
        jobs = scrape_company(company)
        all_jobs.extend(jobs)
        print(f"  Running total: {len(all_jobs)} jobs", flush=True)
        time.sleep(1)

    checkpoint(f"STAGE 1/4 DONE — {len(all_jobs)} jobs scraped across {len(companies)} companies")

    # Intermediate save: raw scraped jobs (before any LLM work)
    raw_path = OUTPUT_PATH.parent / "jobs_raw.json"
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(raw_path, "w") as f:
        json.dump({"scraped_at": datetime.now(timezone.utc).isoformat(), "total_jobs": len(all_jobs), "jobs": all_jobs}, f, indent=2)
    print(f"  Raw snapshot saved → {raw_path}", flush=True)

    # ── Stage 2: Classify ─────────────────────────────────────────────────────
    if not args.no_classify and all_jobs:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("\nWARNING: ANTHROPIC_API_KEY not set. Skipping classification.", flush=True)
        else:
            checkpoint(f"STAGE 2/4 — CLASSIFYING {len(all_jobs)} jobs with Claude Sonnet")
            all_jobs = classify_jobs(all_jobs)
            checkpoint(f"STAGE 2/4 DONE — classification complete")

    # ── Stage 3: Vertical + Social Impact ────────────────────────────────────
    checkpoint("STAGE 3/4 — VERTICAL + SOCIAL IMPACT CLASSIFICATION")
    print("  Run vertical_classifier.py --input <staging path> separately after scrape completes.", flush=True)

    # ── Stage 4: Summarize ────────────────────────────────────────────────────
    company_summaries: dict = {}
    if not args.no_classify and not args.no_summarize and all_jobs:
        if os.environ.get("ANTHROPIC_API_KEY"):
            checkpoint(f"STAGE 4/4 — SUMMARIZING {len(set(j['company'] for j in all_jobs))} companies with Claude Opus")
            company_summaries = summarize_companies(all_jobs)
            checkpoint("STAGE 4/4 DONE — summaries complete")

    # ── Write final output ────────────────────────────────────────────────────
    output = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "total_jobs": len(all_jobs),
        "companies": _company_summary(all_jobs),
        "company_summaries": company_summaries,
        "jobs": all_jobs,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    checkpoint(f"DONE — written to {OUTPUT_PATH}")
    print(f"  Companies : {len(output['companies'])}", flush=True)
    print(f"  Total jobs: {output['total_jobs']}", flush=True)


def _company_summary(jobs: list[dict]) -> dict:
    summary = {}
    for job in jobs:
        co = job["company"]
        if co not in summary:
            summary[co] = {"total": 0, "by_category": {}}
        summary[co]["total"] += 1
        cat = job.get("category") or "unclassified"
        summary[co]["by_category"][cat] = summary[co]["by_category"].get(cat, 0) + 1
    return summary


if __name__ == "__main__":
    main()
