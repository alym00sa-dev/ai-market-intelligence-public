"""
Ornn OCPI — daily GPU compute-cost pull (keyless, free tier) → ornn/data/gpu_prices_daily.{csv,json}

Captures the current settled $/hr index for every tracked GPU and appends one dated row per GPU.
Idempotent: re-running the same UTC day updates that day's value rather than duplicating it. Meant
to run once a day (locally or as a scheduled job) so a compute-cost time series accumulates. Seed
the first 3 months from the Ornn site download; this keeps it current going forward.

No API key needed — the free tier serves current values without auth.

Usage:
    python fetch_daily.py
"""
import csv
import json
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE = "https://api.ornnai.com"
OUT_DIR = Path(__file__).parent / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
CSV = OUT_DIR / "gpu_prices_daily.csv"
JSON = OUT_DIR / "gpu_prices_daily.json"
COLS = ["date", "gpu_name", "index_value_usd_hr", "source_updated_at", "captured_at"]


def tracked_gpus() -> list:
    r = requests.get(f"{BASE}/api/gpu-types", timeout=30)
    r.raise_for_status()
    d = r.json()
    return [x["gpu_name"] for x in (d.get("data", d))]


def current_price(gpu: str) -> "dict | None":
    r = requests.get(f"{BASE}/api/gpu/{urllib.parse.quote(gpu)}", timeout=30)
    if r.status_code != 200:
        print(f"  [skip] {gpu}: HTTP {r.status_code}")
        return None
    return r.json()["data"]


def _load_existing() -> dict:
    """(date, gpu) -> row, so we can upsert today's value."""
    rows = {}
    if CSV.exists():
        for r in csv.DictReader(open(CSV)):
            rows[(r["date"], r["gpu_name"])] = r
    return rows


def run() -> None:
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    rows = _load_existing()
    print(f"[ornn] pulling daily GPU prices for {today}")

    added = 0
    for g in tracked_gpus():
        d = current_price(g)
        if not d:
            continue
        rows[(today, g)] = {
            "date": today,
            "gpu_name": g,
            "index_value_usd_hr": d.get("index_value"),
            "source_updated_at": d.get("last_updated"),
            "captured_at": now.isoformat(),
        }
        added += 1
        print(f"  {g:16} ${d.get('index_value')}/hr")

    ordered = sorted(rows.values(), key=lambda r: (r["date"], r["gpu_name"]))
    with open(CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(ordered)
    JSON.write_text(json.dumps({"updated_at": now.isoformat(), "rows": ordered}, indent=1))

    dates = sorted({r["date"] for r in ordered})
    print(f"[ornn] wrote {len(ordered)} rows across {len(dates)} day(s) "
          f"({dates[0]}→{dates[-1]}); {added} GPUs captured today → data/gpu_prices_daily.csv")


if __name__ == "__main__":
    run()
