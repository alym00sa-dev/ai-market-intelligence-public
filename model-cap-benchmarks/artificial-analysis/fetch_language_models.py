"""
Pull the full Artificial Analysis language-models catalog (Pro tier) → data/language_models.json

Uses the v2 /language/models endpoint with the upgraded Pro key (header `x-api-key`), paginating
via `page` until `has_more` is false. This endpoint carries fields the old llms_models.json lacks:
  - artificial_analysis_intelligence_index_cost.cost_per_task  (total / input / reasoning / answer $)
  - artificial_analysis_intelligence_index_cost.total_cost     (cost to run the whole eval suite)
  - artificial_analysis_intelligence_index_token_counts
  - reasoning_model (boolean flag — no name-guessing), context_window_tokens, parameters,
    licensing, modalities, richer pricing (7:2:1 blend, cache tokens)

Auth: ARTIFICIAL_ANALYSIS_API_KEY in the repo-root .env (the active, uncommented one).

Usage:
    python fetch_language_models.py
"""
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE = "https://artificialanalysis.ai/api/v2/language/models"
OUT_DIR = Path(__file__).parent / "data"
OUT_DIR.mkdir(exist_ok=True)


def _api_key() -> str:
    if os.environ.get("ARTIFICIAL_ANALYSIS_API_KEY"):
        return os.environ["ARTIFICIAL_ANALYSIS_API_KEY"]
    for env in (Path(__file__).parents[3] / ".env", Path(__file__).parents[2] / ".env"):
        if env.exists():
            for line in env.read_text().splitlines():
                s = line.strip()
                if s.startswith("#") or "=" not in s:
                    continue
                k, _, v = s.partition("=")
                if k.strip() == "ARTIFICIAL_ANALYSIS_API_KEY":
                    return v.strip().strip('"').strip("'")
    raise SystemExit("ARTIFICIAL_ANALYSIS_API_KEY not found (env or .env)")


def fetch_all() -> dict:
    headers = {"x-api-key": _api_key(), "Accept": "application/json"}
    models, page = [], 1
    meta = {}
    while True:
        r = requests.get(BASE, headers=headers, params={"page": page, "page_size": 200}, timeout=60)
        r.raise_for_status()
        j = r.json()
        batch = j.get("data", [])
        models.extend(batch)
        pg = j.get("pagination", {})
        meta = {"tier": j.get("tier"), "intelligence_index_version": j.get("intelligence_index_version")}
        print(f"  page {page}/{pg.get('total_pages','?')}: +{len(batch)} ({len(models)} total)")
        if not pg.get("has_more"):
            break
        page += 1
        time.sleep(0.5)
    # de-dupe defensively by id (keep first)
    seen, uniq = set(), []
    for m in models:
        if m["id"] not in seen:
            seen.add(m["id"]); uniq.append(m)
    return {**meta, "count": len(uniq), "data": uniq}


def main():
    print("Artificial Analysis — /language/models (Pro)")
    payload = fetch_all()
    out = OUT_DIR / "language_models.json"
    doc = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": "artificial_analysis",
        "endpoint": "/api/v2/language/models",
        **payload,
    }
    out.write_text(json.dumps(doc, indent=2))
    n = payload["count"]
    with_cost = sum(1 for m in payload["data"] if m.get("artificial_analysis_intelligence_index_cost"))
    kb = out.stat().st_size // 1024
    print(f"\nsaved → {out}  ({n} models, {kb} KB)")
    print(f"tier={payload['tier']} | intelligence_index_version={payload['intelligence_index_version']}")
    print(f"models with intelligence_index_cost (cost_per_task): {with_cost}/{n}")


if __name__ == "__main__":
    main()
