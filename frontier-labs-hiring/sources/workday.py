"""Workday public job board scraper.

Workday boards expose an undocumented but publicly accessible REST API:

  list:   POST https://{tenant}.wd5.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs
  detail: GET  https://{tenant}.wd5.myworkdayjobs.com/wday/cxs/{tenant}/{board}{externalPath}

No authentication required for public listings.

Notes learned the hard way:
  * The list endpoint hard-caps `limit` at 20 — anything larger returns HTTP 400.
    So we page in steps of 20 up to the reported `total` (NVIDIA exposes ~2000).
  * The list response only gives a coarse `locationsText` (often "N Locations").
    The detail endpoint carries the full description AND a precise location, so we
    fetch it once per job and use it for both.
"""

import html as html_module
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
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate, br",
    # Note: do NOT set Content-Type here — requests sets it automatically
    # when using json=payload, and explicit setting causes a 400 from Workday.
}

PAGE_SIZE      = 20    # Workday hard-caps the jobs endpoint at 20 per request
DESC_WORKERS   = 10    # concurrent detail fetches
MAX_DESC_CHARS = 1500


def fetch_jobs(tenant: str, board: str) -> list[dict]:
    """
    tenant: the Workday tenant slug (e.g. 'nvidia')
    board:  the job board name (e.g. 'NVIDIAExternalCareerSite')
    """
    base = f"https://{tenant}.wd5.myworkdayjobs.com"
    api_url = f"{base}/wday/cxs/{tenant}/{board}/jobs"
    board_url = f"{base}/{board}"

    # Workday wants a session cookie obtained by visiting the board page first.
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        session.get(board_url, timeout=30)
        time.sleep(0.5)
    except Exception as e:
        print(f"    [workday] session init error: {e}")

    jobs = _fetch_listings(session, api_url, base, board)
    if not jobs:
        return []

    jobs = _enrich(session, jobs, base, tenant, board)
    for j in jobs:
        j.pop("_path", None)
    return jobs


def _fetch_listings(session: requests.Session, api_url: str, base: str, board: str) -> list[dict]:
    jobs = []
    offset = 0
    total = None

    while True:
        payload = {"appliedFacets": {}, "limit": PAGE_SIZE, "offset": offset, "searchText": ""}
        data = None
        for attempt in range(3):
            try:
                resp = session.post(api_url, json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as e:
                wait = 5 * (attempt + 1)
                print(f"    [workday] page offset={offset} attempt {attempt + 1} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
        if data is None:
            print(f"    [workday] giving up at offset={offset}")
            break

        batch = data.get("jobPostings", [])
        if not batch:
            break

        for job in batch:
            job_path = job.get("externalPath", "")
            full_url = f"{base}/{board}{job_path}" if job_path else ""

            locations = job.get("locationsText", "") or ""
            if isinstance(locations, list):
                locations = ", ".join(locations)

            bullets = job.get("bulletFields") or []
            jobs.append({
                "id":         bullets[0] if bullets else job_path.split("/")[-1],
                "title":      job.get("title", ""),
                "department": job.get("jobFamilyGroup", ""),
                "location":   locations,
                "url":        full_url,
                "_path":      job_path,
            })

        if total is None:
            total = data.get("total", 0)
            print(f"    [workday] {total} jobs reported by board", flush=True)

        offset += PAGE_SIZE
        if offset % 200 == 0:
            print(f"    [workday] listed {len(jobs)}/{total}...", flush=True)
        if total is not None and offset >= total:
            break
        time.sleep(0.4)

    print(f"    [workday] {len(jobs)} listings collected", flush=True)
    return jobs


def _strip_html(raw: str) -> str:
    text = html_module.unescape(raw or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_DESC_CHARS]


def _fetch_detail(session: requests.Session, job: dict, base: str, tenant: str, board: str) -> tuple[str, str, str]:
    """Returns (job_id, description, precise_location). Best-effort; '' on failure."""
    path = job.get("_path") or ""
    if not path:
        return job["id"], "", ""
    detail_url = f"{base}/wday/cxs/{tenant}/{board}{path}"
    try:
        resp = session.get(detail_url, timeout=15)
        if resp.status_code == 200:
            info = resp.json().get("jobPostingInfo", {})
            desc = _strip_html(info.get("jobDescription", ""))
            loc = info.get("location", "") or ""
            extra = info.get("additionalLocations") or []
            if extra:
                loc = ", ".join([loc] + [str(x) for x in extra if x]) if loc else ", ".join(str(x) for x in extra if x)
            return job["id"], desc, loc
    except Exception:
        pass
    return job["id"], "", ""


def _enrich(session: requests.Session, jobs: list[dict], base: str, tenant: str, board: str) -> list[dict]:
    print(f"    [workday] fetching descriptions for {len(jobs)} jobs...", flush=True)
    desc_map: dict[str, str] = {}
    loc_map: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=DESC_WORKERS) as ex:
        futures = [ex.submit(_fetch_detail, session, j, base, tenant, board) for j in jobs]
        done = 0
        for future in as_completed(futures):
            jid, desc, loc = future.result()
            if desc:
                desc_map[jid] = desc
            if loc:
                loc_map[jid] = loc
            done += 1
            if done % 100 == 0:
                print(f"    [workday] descriptions: {done}/{len(jobs)}", flush=True)

    for job in jobs:
        if job["id"] in desc_map:
            job["description"] = desc_map[job["id"]]
        # Prefer the precise detail location over coarse "N Locations" placeholders.
        loc = job.get("location", "")
        if job["id"] in loc_map and (not loc or re.match(r"^\d+\s+Location", loc)):
            job["location"] = loc_map[job["id"]]

    fetched = sum(1 for j in jobs if j.get("description"))
    print(f"    [workday] {fetched}/{len(jobs)} jobs have descriptions", flush=True)
    return jobs
