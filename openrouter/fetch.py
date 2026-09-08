"""
Pull OpenRouter market-intelligence datasets → openrouter/data/*.json (+ flat CSVs).

Public market-wide data (everyone's OpenRouter traffic), auth = regular API key (Bearer):
  1. /datasets/rankings-daily   — top-50 models by token usage over time (usage + rankings + trend)
  2. /classifications/task      — market share by task (usage_share / token_share, + top models per task)
  3. /datasets/session-cost     — median cost per session by app (harness) × model × turn-range

Auth: OPENROUTER_API_KEY in the repo-root .env. Limits: 30 req/min, 500/day.

Usage:
    python fetch.py
"""
import csv
import json
import os
import time
from datetime import datetime, timezone, date
from pathlib import Path

import requests

BASE = "https://openrouter.ai/api/v1"
OUT_DIR = Path(__file__).parent / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
HISTORY_START = "2025-01-01"          # earliest data OpenRouter serves
DAILY_LOOKBACK_DAYS = 90               # also pull day-level detail for the recent window


def _api_key() -> str:
    if os.environ.get("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    for env in (Path(__file__).parents[2] / ".env", Path(__file__).parents[1] / ".env"):
        if env.exists():
            for line in env.read_text().splitlines():
                s = line.strip()
                if s.startswith("#") or "=" not in s:
                    continue
                k, _, v = s.partition("=")
                if k.strip() == "OPENROUTER_API_KEY":
                    return v.strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_API_KEY not found (env or .env)")


HEADERS = {"Authorization": f"Bearer {_api_key()}", "Accept": "application/json"}


def _get(path: str, **params) -> dict:
    r = requests.get(BASE + path, headers=HEADERS, params=params, timeout=90)
    r.raise_for_status()
    return r.json()


def _save(name: str, doc: dict) -> None:
    p = OUT_DIR / name
    p.write_text(json.dumps(doc, indent=2))
    print(f"  saved → data/{name}  ({p.stat().st_size // 1024} KB)")


def _stamp(payload: dict, **extra) -> dict:
    return {"fetched_at": datetime.now(timezone.utc).isoformat(), "source": "openrouter", **extra, **payload}


# ── 1. rankings-daily ─────────────────────────────────────────────────────────
def fetch_rankings() -> None:
    today = date.today()
    print("[rankings-daily] monthly full history + daily recent window")

    # API caps each request at 366 days — walk the full history in ≤365-day chunks.
    monthly_rows, meta = [], {}
    cur = date.fromisoformat(HISTORY_START)
    while cur <= today:
        chunk_end = min(date.fromordinal(cur.toordinal() + 365), today)
        j = _get("/datasets/rankings-daily", start_date=cur.isoformat(),
                 end_date=chunk_end.isoformat(), period="month")
        monthly_rows.extend(j.get("data", []))
        meta = j.get("meta", {})
        print(f"  monthly {cur} → {chunk_end}: +{len(j.get('data', []))} ({len(monthly_rows)} total)")
        cur = date.fromordinal(chunk_end.toordinal() + 1)
        time.sleep(2)
    monthly = {"data": monthly_rows, "meta": {**meta, "start_date": HISTORY_START, "end_date": today.isoformat()}}

    day_start = date.fromordinal(today.toordinal() - DAILY_LOOKBACK_DAYS)
    daily = _get("/datasets/rankings-daily",
                 start_date=day_start.isoformat(), end_date=today.isoformat(), period="day")

    _save("rankings_monthly.json", _stamp(monthly, endpoint="/datasets/rankings-daily", period="month"))
    _save("rankings_daily.json", _stamp(daily, endpoint="/datasets/rankings-daily", period="day"))

    # flat CSV with a per-date rank (rows arrive ordered by usage within each date)
    for name, doc in (("rankings_monthly.csv", monthly), ("rankings_daily.csv", daily)):
        rows = doc.get("data", [])
        rank_by_date: dict = {}
        with open(OUT_DIR / name, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["date", "rank", "model_permaslug", "total_tokens"])
            for r in rows:
                d = r["date"]
                rank_by_date[d] = rank_by_date.get(d, 0) + 1
                w.writerow([d, rank_by_date[d], r["model_permaslug"], r["total_tokens"]])
        print(f"  saved → data/{name}  ({len(rows)} rows)")


# ── 2. task market share ──────────────────────────────────────────────────────
def fetch_market_share() -> None:
    print("[classifications/task] market share by task")
    j = _get("/classifications/task")
    _save("market_share.json", _stamp(j, endpoint="/classifications/task"))
    d = j.get("data", {})
    cls = d.get("classifications", [])
    # flat CSV: one row per task classification (top-level shares)
    with open(OUT_DIR / "market_share.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tag", "display_name", "macro_category", "usage_share", "token_share",
                    "category_usage_share", "category_token_share", "n_models"])
        for c in cls:
            w.writerow([c.get("tag"), c.get("display_name"), c.get("macro_category"),
                        c.get("usage_share"), c.get("token_share"),
                        c.get("category_usage_share"), c.get("category_token_share"),
                        len(c.get("models", []))])
    print(f"  saved → data/market_share.csv  ({len(cls)} classifications, window {d.get('window_days')}d)")


# ── 3. session cost ───────────────────────────────────────────────────────────
def fetch_session_cost() -> None:
    print("[datasets/session-cost] median cost per session (paginated)")
    rows, offset, meta = [], 0, {}
    while True:
        j = _get("/datasets/session-cost", limit=500, offset=offset)
        batch = j.get("data", [])
        rows.extend(batch)
        meta = j.get("meta", {})
        print(f"  offset {offset}: +{len(batch)} ({len(rows)} total)")
        if len(batch) < 500 or offset >= 5000:
            break
        offset += 500
        time.sleep(2)
    _save("session_cost.json", _stamp({"data": rows, "meta": meta}, endpoint="/datasets/session-cost"))
    with open(OUT_DIR / "session_cost.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["app_slug", "app_name", "model_permaslug", "turn_range", "median_session_cost_usd"])
        for r in rows:
            w.writerow([r.get("app_slug"), r.get("app_name"), r.get("model_permaslug"),
                        r.get("turn_range"), r.get("median_session_cost_usd")])
    print(f"  saved → data/session_cost.csv  ({len(rows)} rows, window {meta.get('window_days')}d)")


def main():
    print("OpenRouter — market-intelligence pull\n" + "=" * 44)
    fetch_rankings();      time.sleep(2)
    fetch_market_share();  time.sleep(2)
    fetch_session_cost()
    print("\nDone.")


if __name__ == "__main__":
    main()
