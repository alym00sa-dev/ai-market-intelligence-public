"""ByteDance public job board scraper.

ByteDance exposes a public JSON search API behind jobs.bytedance.com:
  POST https://jobs.bytedance.com/api/v1/search/job/posts

It accepts a free-text `keyword` plus `limit`/`offset` paging (100/page, deep
offsets work) and returns full descriptions inline — so no browser and no
per-job enrichment is needed. We search across a set of AI keywords and union
the (deduped) results to capture all AI-tagged roles, including Chinese-language
postings (Doubao / 抖音 / 火山方舟 etc.).

This replaces the old Playwright scraper, which only loaded page 1 for two
keywords (~24 jobs) with no pagination.
"""

import re
import time

import requests

API_URL = "https://jobs.bytedance.com/api/v1/search/job/posts"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/json",
    "portal-platform": "PC",
    "portal-channel": "office",
}

PAGE_SIZE      = 100
MAX_DESC_CHARS = 1500
SAFETY_CAP     = 8000   # per-keyword guard against runaway pagination

DEFAULT_KEYWORDS = ["AI"]


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
        offset = 0
        kw_added = 0
        while offset < SAFETY_CAP:
            payload = {
                "keyword": kw,
                "limit": PAGE_SIZE,
                "offset": offset,
                "job_category_id_list": [],
                "location_code_list": [],
                "subject_id_list": [],
                "recruitment_id_list": [],
            }
            data = None
            for attempt in range(3):
                try:
                    resp = session.post(API_URL, json=payload, timeout=30)
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except Exception as e:
                    wait = 4 * (attempt + 1)
                    print(f"    [bytedance] kw={kw!r} offset={offset} attempt {attempt+1} failed: {e}. Retry in {wait}s")
                    time.sleep(wait)
            if data is None:
                break

            dd = data.get("data") or {}
            batch = dd.get("job_post_list") or []
            if not batch:
                break

            for job in batch:
                jid = str(job.get("id", ""))
                if not jid or jid in seen:
                    continue
                seen.add(jid)

                city_info = job.get("city_info") or {}
                location = ""
                if isinstance(city_info, dict):
                    location = city_info.get("en_name") or city_info.get("city_name") or ""

                cat = job.get("job_category") or {}
                dept = cat.get("en_name") or cat.get("name") or "" if isinstance(cat, dict) else ""

                desc = _strip(f"{job.get('description', '')} {job.get('requirement', '')}")

                jobs.append({
                    "id": jid,
                    "title": job.get("title", ""),
                    "department": dept,
                    "location": location,
                    "url": f"https://jobs.bytedance.com/en/position/{jid}/detail",
                    "description": desc,
                })
                kw_added += 1

            count = dd.get("count", 0)
            offset += PAGE_SIZE
            if offset >= count:
                break
            time.sleep(0.3)

        print(f"    [bytedance] kw={kw!r}: +{kw_added} new (running total {len(jobs)})", flush=True)

    print(f"    [bytedance] {len(jobs)} unique jobs across {len(keywords)} keyword(s)", flush=True)
    return jobs
