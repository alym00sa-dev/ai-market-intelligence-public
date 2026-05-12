"""Ashby public job board scraper.

Ashby embeds all job postings as a JSON array inside a `"jobPostings":[...]`
key that's serialised directly into the page HTML (hydration data).
We locate that key, extract the array with bracket counting, then parse each
posting. Individual job descriptions are fetched concurrently via the
Ashby posting API.
"""

import html as html_module
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

MAX_DESC_CHARS = 1500
DESC_WORKERS   = 10  # concurrent description fetches


def _strip_html(raw: str) -> str:
    text = html_module.unescape(raw or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ")  # non-breaking spaces from &nbsp;
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_DESC_CHARS]


def fetch_jobs(board_id: str) -> list[dict]:
    url = f"https://jobs.ashbyhq.com/{board_id}"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"  # Ashby pages are UTF-8; don't let requests guess wrong
    jobs = _extract_job_postings(resp.text, board_id)
    print(f"    [ashby] {len(jobs)} listings found, fetching descriptions...")
    jobs = _enrich_descriptions(jobs, board_id)
    return jobs


def _extract_job_postings(html: str, board_id: str) -> list[dict]:
    marker = '"jobPostings":['
    start = html.find(marker)
    if start == -1:
        return []

    array_start = start + len(marker) - 1
    depth = 0
    end = array_start
    for i, ch in enumerate(html[array_start:], array_start):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    raw_array = html[array_start:end]
    try:
        postings = json.loads(raw_array)
    except json.JSONDecodeError:
        return []

    jobs = []
    for p in postings:
        if not p.get("isListed", True):
            continue

        job_id    = p.get("id") or p.get("jobId") or ""
        title     = p.get("title") or p.get("name") or ""
        department = p.get("departmentName") or p.get("teamName") or ""
        location   = p.get("locationName") or p.get("locationExternalName") or ""
        job_url    = f"https://jobs.ashbyhq.com/{board_id}/{job_id}"

        # Use description from listing JSON if already present
        desc = p.get("descriptionPlain") or _strip_html(p.get("descriptionSafe") or p.get("description") or "")

        jobs.append({
            "id": job_id,
            "title": title,
            "department": department,
            "location": location,
            "url": job_url,
            "description": desc,
        })

    return jobs


def _fetch_single_description(job: dict, board_id: str) -> tuple[str, str]:
    """Returns (job_id, description). Fetches individual Ashby job page."""
    if job.get("description"):
        return job["id"], job["description"]

    job_id = job["id"]
    try:
        # Try Ashby's posting API first (returns JSON with full description)
        api_url = f"https://api.ashbyhq.com/posting-api/job-board/{board_id}/postings/{job_id}"
        resp = requests.get(api_url, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            posting = data.get("posting", data)
            desc = posting.get("descriptionPlain") or _strip_html(
                posting.get("descriptionSafe") or posting.get("description") or ""
            )
            if desc:
                return job_id, desc

        # Fallback: scrape the HTML job page
        page_url = f"https://jobs.ashbyhq.com/{board_id}/{job_id}"
        resp = requests.get(page_url, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            # Ashby job pages embed description in JSON hydration or in meta tags
            html = resp.text

            # Try hydration JSON first
            for pattern in [r'"descriptionPlain"\s*:\s*"((?:[^"\\]|\\.)*)"',
                            r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"']:
                m = re.search(pattern, html)
                if m:
                    try:
                        raw = json.loads(f'"{m.group(1)}"')  # proper JSON string unescape
                    except Exception:
                        raw = m.group(1)
                    clean = html_module.unescape(raw)
                    clean = re.sub(r"<[^>]+>", " ", clean)
                    clean = re.sub(r"\s+", " ", clean).strip()[:MAX_DESC_CHARS]
                    if len(clean) > 50:
                        return job_id, clean

            # Last resort: extract from visible HTML body
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            for sel in ["[class*='description']", "[class*='content']", "main", "article"]:
                el = soup.select_one(sel)
                if el:
                    text = re.sub(r"\s+", " ", el.get_text(" ")).strip()[:MAX_DESC_CHARS]
                    if len(text) > 100:
                        return job_id, text

    except Exception:
        pass

    return job_id, ""


def _enrich_descriptions(jobs: list[dict], board_id: str) -> list[dict]:
    """Concurrently fetch descriptions for jobs that don't have one yet."""
    needs_fetch = [j for j in jobs if not j.get("description")]
    if not needs_fetch:
        return jobs

    desc_map: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=DESC_WORKERS) as executor:
        futures = {executor.submit(_fetch_single_description, j, board_id): j["id"] for j in needs_fetch}
        done = 0
        for future in as_completed(futures):
            job_id, desc = future.result()
            desc_map[job_id] = desc
            done += 1
            if done % 20 == 0:
                print(f"    [ashby] descriptions: {done}/{len(needs_fetch)}", flush=True)

    for job in jobs:
        if job["id"] in desc_map:
            job["description"] = desc_map[job["id"]]

    fetched = sum(1 for j in jobs if j.get("description"))
    print(f"    [ashby] {fetched}/{len(jobs)} jobs have descriptions", flush=True)
    return jobs
