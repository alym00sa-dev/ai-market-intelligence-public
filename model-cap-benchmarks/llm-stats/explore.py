"""
Explore the LLM Stats API.
Base: https://api.llm-stats.com/stats/v1
Auth: Bearer token (LLM_STATS_API_KEY)

Rate limits:
  /models/{id}  120/min
  /rankings     120/min
  /models       60/min
  /benchmarks   60/min
  /updates      60/min
  /scores       30/min  ← most restrictive, add extra sleep
"""

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

API_KEY = os.environ.get("LLM_STATS_API_KEY", "")
if not API_KEY:
    print("ERROR: LLM_STATS_API_KEY not set")
    sys.exit(1)

BASE = "https://api.llm-stats.com/stats/v1"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Accept": "application/json",
}


def fetch(path: str, params: dict = None) -> dict | list | None:
    url = BASE + path
    r = requests.get(url, headers=HEADERS, params=params, timeout=15)
    print(f"  {r.status_code}  GET {url}" + (f"  params={params}" if params else ""))
    if not r.ok:
        print(f"         → error: {r.text[:300]}")
        return None
    return r.json()


def summarise(data) -> None:
    if isinstance(data, list):
        print(f"         → {len(data)} items")
        if data and isinstance(data[0], dict):
            print(f"         → keys: {list(data[0].keys())}")
            print(f"         → first item:\n{json.dumps(data[0], indent=2)[:800]}")
    elif isinstance(data, dict):
        print(f"         → keys: {list(data.keys())}")
        print(f"         → sample:\n{json.dumps(data, indent=2)[:800]}")


print("=" * 60)
print("LLM Stats API — endpoint explorer")
print("=" * 60)

# ── /models (60/min) ──────────────────────────────────────────
print("\n── /models — catalog with metadata, pricing, category scores ──")
models = fetch("/models")
if models:
    summarise(models)
    time.sleep(1)

    # ── /models/{id} (120/min) — pick first model for detail ──
    first = models[0] if isinstance(models, list) else None
    if first and isinstance(first, dict):
        model_id = first.get("id") or first.get("model_id") or first.get("slug")
        if model_id:
            print(f"\n── /models/{model_id} — full detail with all benchmark scores ──")
            detail = fetch(f"/models/{model_id}")
            if detail:
                summarise(detail)
            time.sleep(0.5)

# ── /benchmarks (60/min) ──────────────────────────────────────
print("\n── /benchmarks — all benchmarks with categories and model counts ──")
benchmarks = fetch("/benchmarks")
if benchmarks:
    summarise(benchmarks)
time.sleep(1)

# ── /rankings (120/min) ───────────────────────────────────────
print("\n── /rankings — TrueSkill rankings by category ──")
rankings = fetch("/rankings")
if rankings:
    summarise(rankings)
time.sleep(0.5)

# ── /updates (60/min) ─────────────────────────────────────────
print("\n── /updates — recently added models (default lookback) ──")
updates = fetch("/updates")
if updates:
    summarise(updates)
time.sleep(1)

# ── /scores (30/min — most restrictive) ───────────────────────
print("\n── /scores — score matrix across models and benchmarks ──")
scores = fetch("/scores")
if scores:
    summarise(scores)

print("\nDone.")
