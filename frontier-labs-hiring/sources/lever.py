"""Lever public API scraper."""

import html as html_module
import re
import requests

BASE_URL = "https://api.lever.co/v0/postings/{board_id}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MarketIntelBot/1.0)"
}


def _clean_text(text: str, max_chars: int = 1500) -> str:
    text = html_module.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ")  # non-breaking spaces
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def fetch_jobs(board_id: str) -> list[dict]:
    url = BASE_URL.format(board_id=board_id)
    resp = requests.get(url, params={"mode": "json"}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for job in data:
        categories = job.get("categories", {})
        # Prefer plain text description; fall back to stripping HTML
        description = _clean_text(job.get("descriptionPlain", "") or job.get("description", ""))
        jobs.append({
            "id": job.get("id", ""),
            "title": job.get("text", ""),
            "department": categories.get("team", categories.get("department", "")),
            "location": categories.get("location", ""),
            "url": job.get("hostedUrl", ""),
            "description": description,
        })

    return jobs
