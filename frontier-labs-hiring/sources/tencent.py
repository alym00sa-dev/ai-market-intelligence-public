"""Tencent careers public API scraper.

Tencent (incl. the Hunyuan large-model team) publishes roles through a public
JSON API behind careers.tencent.com:
  GET https://careers.tencent.com/tencentcareer/api/post/Query

It requires a millisecond `timestamp` query param, accepts a free-text
`keyword`, and pages via `pageIndex`/`pageSize` (100/page). Each post carries
its full responsibility text, location, category and a canonical URL — so no
browser or per-job enrichment is needed.

We search a focused set of AI keywords and union the deduped results to pull
AI roles across Tencent's business groups while leaving out the bulk of its
non-AI conglomerate hiring.
"""

import re
import time

import requests

API_URL = "https://careers.tencent.com/tencentcareer/api/post/Query"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://careers.tencent.com/",
}

PAGE_SIZE      = 100
MAX_DESC_CHARS = 1500
SAFETY_CAP     = 5000   # per-keyword guard

DEFAULT_KEYWORDS = ["AI", "machine learning", "large model", "LLM", "Hunyuan", "deep learning"]


def _strip(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = text.replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()[:MAX_DESC_CHARS]


def fetch_jobs(ai_filter: list[str] | None = None) -> list[dict]:
    keywords = ai_filter or DEFAULT_KEYWORDS
    session = requests.Session()
    session.headers.update(HEADERS)

    seen: set[str] = set()
    jobs: list[dict] = []

    for kw in keywords:
        page = 1
        kw_added = 0
        while page * PAGE_SIZE <= SAFETY_CAP:
            params = {
                "timestamp": int(time.time() * 1000),
                "keyword": kw,
                "pageIndex": page,
                "pageSize": PAGE_SIZE,
                "language": "en-us",
            }
            data = None
            for attempt in range(3):
                try:
                    resp = session.get(API_URL, params=params, timeout=30)
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except Exception as e:
                    wait = 4 * (attempt + 1)
                    print(f"    [tencent] kw={kw!r} page={page} attempt {attempt+1} failed: {e}. Retry in {wait}s")
                    time.sleep(wait)
            if data is None:
                break

            dd = data.get("Data") or {}
            posts = dd.get("Posts") or []
            if not posts:
                break

            for p in posts:
                pid = str(p.get("PostId") or p.get("RecruitPostId") or "")
                if not pid or pid in seen:
                    continue
                seen.add(pid)

                location = p.get("LocationName") or ""
                country = p.get("CountryName") or ""
                if country and country not in location:
                    location = f"{location}, {country}".strip(", ")

                category = p.get("CategoryName") or ""
                bg = p.get("BGName") or ""
                dept = f"{bg} · {category}".strip(" ·") if (bg or category) else ""

                jobs.append({
                    "id": pid,
                    "title": p.get("RecruitPostName", ""),
                    "department": dept,
                    "location": location,
                    "url": p.get("PostURL", ""),
                    "description": _strip(p.get("Responsibility", "")),
                })
                kw_added += 1

            count = dd.get("Count", 0)
            if page * PAGE_SIZE >= count:
                break
            page += 1
            time.sleep(0.3)

        print(f"    [tencent] kw={kw!r}: +{kw_added} new (running total {len(jobs)})", flush=True)

    print(f"    [tencent] {len(jobs)} unique jobs across {len(keywords)} keyword(s)", flush=True)
    return jobs
