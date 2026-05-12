"""Workday public job board scraper.

Workday boards expose an undocumented but publicly accessible REST endpoint:
  POST https://{tenant}.wd5.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs

No authentication required for public job listings.
"""

import time

import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate, br",
    # Note: do NOT set Content-Type here — requests sets it automatically
    # when using json=payload, and explicit setting causes a 400 from Workday.
}

PAGE_SIZE = 100


def fetch_jobs(tenant: str, board: str) -> list[dict]:
    """
    tenant: the Workday tenant slug (e.g. 'nvidia')
    board:  the job board name (e.g. 'NVIDIAExternalCareerSite')
    """
    api_url = f"https://{tenant}.wd5.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs"
    board_url = f"https://{tenant}.wd5.myworkdayjobs.com/{board}"

    # Workday requires a session cookie obtained by visiting the board page first
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        session.get(board_url, timeout=30)
        time.sleep(0.5)
    except Exception as e:
        print(f"    [workday] session init error: {e}")

    jobs = []
    offset = 0

    while True:
        payload = {
            "appliedFacets": {},
            "limit": PAGE_SIZE,
            "offset": offset,
            "searchText": "",
        }
        data = None
        for attempt in range(3):
            try:
                resp = session.post(api_url, json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as e:
                wait = 5 * (attempt + 1)
                print(f"    [workday] attempt {attempt + 1} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
        if data is None:
            print(f"    [workday] giving up at offset={offset}")
            break

        batch = data.get("jobPostings", [])
        if not batch:
            break

        for job in batch:
            # Workday returns a relative URL like /en-US/NVIDIAExternalCareerSite/job/...
            job_path = job.get("externalPath", "")
            full_url = f"https://{tenant}.wd5.myworkdayjobs.com{job_path}" if job_path else ""

            # Location: can be a list or a single string
            locations = job.get("locationsText", "") or ""
            if isinstance(locations, list):
                locations = ", ".join(locations)

            jobs.append({
                "id": job.get("bulletFields", [""])[0] if job.get("bulletFields") else job_path.split("/")[-1],
                "title": job.get("title", ""),
                "department": job.get("jobFamilyGroup", ""),
                "location": locations,
                "url": full_url,
            })

        total = data.get("total", 0)
        offset += PAGE_SIZE
        if offset >= total:
            break

        time.sleep(0.5)

    return jobs
