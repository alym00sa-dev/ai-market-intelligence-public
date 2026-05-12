"""Greenhouse public API scraper."""

import html as html_module
import re
import requests

BASE_URL = "https://boards-api.greenhouse.io/v1/boards/{board_id}/jobs"
EU_BASE_URL = "https://boards-api.eu.greenhouse.io/v1/boards/{board_id}/jobs"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MarketIntelBot/1.0)"
}


def _strip_html(html: str, max_chars: int = 1500) -> str:
    text = html_module.unescape(html or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ")  # non-breaking spaces from &nbsp;
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def fetch_jobs(board_id: str, eu: bool = False) -> list[dict]:
    url = (EU_BASE_URL if eu else BASE_URL).format(board_id=board_id)
    resp = requests.get(url, params={"content": "true"}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for job in data.get("jobs", []):
        departments = job.get("departments", [])
        department = departments[0].get("name", "") if departments else ""

        offices = job.get("offices", [])
        location = offices[0].get("name", "") if offices else job.get("location", {}).get("name", "")

        description = _strip_html(job.get("content", ""))

        jobs.append({
            "id": str(job.get("id", "")),
            "title": job.get("title", ""),
            "department": department,
            "location": location,
            "url": job.get("absolute_url", ""),
            "description": description,
        })

    return jobs
