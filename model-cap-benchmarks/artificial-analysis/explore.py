"""
Explore the Artificial Analysis API.
Base:  https://artificialanalysis.ai/api/v2
Auth:  x-api-key header
Limits: Free tier — 1,000 req/day
"""

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

API_KEY = os.environ.get("ARTIFICIAL_ANALYSIS_API_KEY", "")
if not API_KEY:
    print("ERROR: ARTIFICIAL_ANALYSIS_API_KEY not set")
    sys.exit(1)

BASE = "https://artificialanalysis.ai/api/v2"
HEADERS = {
    "x-api-key": API_KEY,
    "Accept": "application/json",
}

ENDPOINTS = [
    ("/data/llms/models",           "LLMs — benchmark scores, pricing, speed, latency"),
    ("/data/media/text-to-image",   "Text-to-Image — ELO ratings"),
    ("/data/media/image-editing",   "Image Editing — ELO ratings"),
    ("/data/media/text-to-speech",  "Text-to-Speech — ELO ratings"),
    ("/data/media/text-to-video",   "Text-to-Video — ELO ratings"),
    ("/data/media/image-to-video",  "Image-to-Video — ELO ratings"),
]


def fetch(path: str, params: dict = None) -> dict | list | None:
    url = BASE + path
    r = requests.get(url, headers=HEADERS, params=params, timeout=15)
    suffix = f"  params={params}" if params else ""
    print(f"  {r.status_code}  GET {url}{suffix}")
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
        keys = list(data.keys())
        print(f"         → keys: {keys}")
        # Drill into first list value if present
        for k in keys:
            if isinstance(data[k], list) and data[k]:
                print(f"         → [{k}] — {len(data[k])} items, first item keys: {list(data[k][0].keys()) if isinstance(data[k][0], dict) else '?'}")
                print(f"         → first:\n{json.dumps(data[k][0], indent=2)[:600]}")
                break
        else:
            print(f"         → sample:\n{json.dumps(data, indent=2)[:600]}")


print("=" * 60)
print("Artificial Analysis API — endpoint explorer")
print("=" * 60)

for path, desc in ENDPOINTS:
    print(f"\n── {desc} ──")
    data = fetch(path)
    if data is not None:
        summarise(data)

        # For text-to-image/video: also try with categories
        if "text-to-image" in path or "text-to-video" in path or "image-to-video" in path:
            print(f"  (with include_categories=true)")
            data_cats = fetch(path, params={"include_categories": "true"})
            if data_cats:
                summarise(data_cats)

    time.sleep(0.5)

print("\nDone.")
