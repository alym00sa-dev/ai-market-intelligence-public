"""
Pull all LLM Stats data and save to JSON files.
Base:  https://api.llm-stats.com/stats/v1
Auth:  Bearer token

Rate limits:
  /models/{id}  120/min
  /rankings     120/min
  /models       60/min
  /benchmarks   60/min
  /updates      60/min
  /scores       30/min  ← most restrictive
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

API_KEY = os.environ["LLM_STATS_API_KEY"]
BASE = "https://api.llm-stats.com/stats/v1"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}
OUT_DIR = Path(__file__).parent / "data"
OUT_DIR.mkdir(exist_ok=True)


def fetch(path: str, params: dict = None, retries: int = 4) -> dict:
    url = BASE + path
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=45)
            r.raise_for_status()
            return r.json()
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError) as e:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt * 3  # 3s, 6s, 12s
            print(f"    timeout/connection error on {path} (attempt {attempt + 1}/{retries}), retrying in {wait}s...")
            time.sleep(wait)


def fetch_paginated(path: str, data_key: str, delay: float = 1.0) -> list:
    """Paginate through cursor-based results until exhausted."""
    results = []
    cursor = None
    page = 1
    while True:
        params = {"cursor": cursor} if cursor else {}
        data = fetch(path, params=params)
        batch = data.get(data_key, [])
        results.extend(batch)
        cursor = data.get("next_cursor")
        total = data.get("total", "?")
        print(f"    page {page}: +{len(batch)} ({len(results)}/{total})")
        if not cursor or not batch:
            break
        page += 1
        time.sleep(delay)
    return results


def save(filename: str, data, meta: dict = None) -> None:
    path = OUT_DIR / filename
    payload = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": "llm_stats",
        **(meta or {}),
        "data": data,
    }
    if isinstance(data, list):
        payload["count"] = len(data)
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    kb = len(json.dumps(payload)) // 1024
    count = len(data) if isinstance(data, list) else "?"
    print(f"  saved → {path}  ({count} records, {kb} KB)")


print("=" * 50)
print("LLM Stats — full data pull")
print("=" * 50)

# ── /models (60/min, paginated) ───────────────────────────────
print("\n[models — full catalog]")
models = fetch_paginated("/models", "models", delay=1.0)
save("models.json", models)

# ── /models/{id} — detail for every model (120/min) ──────────
print("\n[model details — all models]")
details = []
for i, m in enumerate(models):
    mid = m.get("id")
    if not mid:
        continue
    try:
        detail = fetch(f"/models/{mid}")
        details.append(detail)
    except Exception as e:
        print(f"    skip {mid}: {e}")
    if (i + 1) % 10 == 0:
        print(f"    {i + 1}/{len(models)} fetched...")
        time.sleep(0.5)  # well within 120/min
save("model_details.json", details)

# ── /benchmarks (60/min) ─────────────────────────────────────
print("\n[benchmarks]")
bench_data = fetch("/benchmarks")
benchmarks = bench_data.get("benchmarks", bench_data)
save("benchmarks.json", benchmarks)
time.sleep(1)

# ── /scores (30/min, paginated — most restrictive) ────────────
print("\n[scores — full matrix]")
scores = fetch_paginated("/scores", "scores", delay=2.5)
save("scores.json", scores)

# ── /rankings by category ─────────────────────────────────────
print("\n[rankings by category]")
# Discover available categories from scores
cats = list(set(s.get("category", "") for s in scores if s.get("category")))
print(f"  categories found: {cats}")
rankings = {}
for cat in cats:
    try:
        r = fetch("/rankings", params={"category": cat})
        rankings[cat] = r
        print(f"    {cat}: {len(r.get('models', []))} models ranked")
        time.sleep(0.5)
    except Exception as e:
        print(f"    {cat}: error — {e}")
save("rankings.json", rankings, meta={"categories": cats})

# ── /updates — 30-day lookback ────────────────────────────────
print("\n[updates — 30-day lookback]")
updates_data = fetch("/updates", params={"days": 30})
updates = updates_data.get("models", updates_data)
save("updates.json", updates, meta={"days": 30})

print("\nDone.")
