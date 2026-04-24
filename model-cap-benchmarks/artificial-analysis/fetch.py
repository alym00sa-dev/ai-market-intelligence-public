from __future__ import annotations

"""
Pull all Artificial Analysis data and save to JSON files.
Base:  https://artificialanalysis.ai/api/v2
Auth:  x-api-key header
Limit: 1,000 req/day (free tier)
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

API_KEY = os.environ["ARTIFICIAL_ANALYSIS_API_KEY"]
BASE = "https://artificialanalysis.ai/api/v2"
HEADERS = {"x-api-key": API_KEY, "Accept": "application/json"}
OUT_DIR = Path(__file__).parent / "data"
OUT_DIR.mkdir(exist_ok=True)


def fetch(path: str, params: dict = None) -> dict | list:
    url = BASE + path
    for attempt in range(4):
        r = requests.get(url, headers=HEADERS, params=params, timeout=60)
        if r.status_code == 429:
            wait = 15 * (attempt + 1)
            print(f"  rate limited — waiting {wait}s before retry {attempt + 1}/3...")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()
    r.raise_for_status()  # final raise if still 429


def save(filename: str, data) -> None:
    path = OUT_DIR / filename
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  saved → {path}  ({len(json.dumps(data)) // 1024} KB)")


def pull(path: str, filename: str, params: dict = None, label: str = "") -> None:
    out_path = OUT_DIR / filename
    print(f"\n[{label or path}]")
    try:
        raw = fetch(path, params=params)
    except Exception as e:
        print(f"  ERROR: {e}")
        return
    # Unwrap nested 'data' key if present
    data = raw.get("data", raw) if isinstance(raw, dict) else raw
    save(filename, {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": "artificial_analysis",
        "endpoint": path,
        "count": len(data) if isinstance(data, list) else None,
        "data": data,
    })
    count = len(data) if isinstance(data, list) else "?"
    print(f"  {count} records")
    time.sleep(0.5)


print("=" * 50)
print("Artificial Analysis — full data pull")
print("=" * 50)

pull("/data/llms/models",
     "llms_models.json",
     label="LLM models (benchmarks, pricing, speed)")

print("\nDone.")
