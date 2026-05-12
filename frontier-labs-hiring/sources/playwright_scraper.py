"""
Playwright-based scrapers for sites that block simple requests.

Used for: NVIDIA (Workday), Meta, Apple, ByteDance, Microsoft.

Strategy: launch a real Chromium browser, load the page, extract
embedded JSON data or interact with the search API using real session
cookies — then close the browser. Headless by default.
"""

import html as html_module
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from playwright.sync_api import sync_playwright, Page, BrowserContext

MAX_DESC_CHARS = 1500
DESC_WORKERS   = 8

_REQ_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
}


def _fetch_description(url: str) -> str:
    """Fetch and strip plain text from a job detail page. Returns '' on failure."""
    if not url or not url.startswith("http"):
        return ""

    # Workday: use the JSON posting API instead of scraping the JS-rendered page
    if ".myworkdayjobs.com" in url:
        return _fetch_workday_description(url)

    # Microsoft Careers: pages are JS-rendered SPAs but include JSON-LD with full description
    if "apply.careers.microsoft.com" in url:
        return _fetch_description_microsoft(url)

    try:
        from bs4 import BeautifulSoup
        resp = requests.get(url, headers=_REQ_HEADERS, timeout=15)
        if resp.status_code != 200:
            return ""
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["nav", "header", "footer", "script", "style"]):
            tag.decompose()
        for sel in ["[class*='description']", "[class*='job-detail']",
                    "[class*='content']", "[class*='posting']", "main", "article"]:
            el = soup.select_one(sel)
            if el:
                text = re.sub(r"\s+", " ", el.get_text(" ")).strip()
                if len(text) > 100:
                    return text[:MAX_DESC_CHARS]
        text = re.sub(r"\s+", " ", soup.get_text(" ")).strip()
        return text[:MAX_DESC_CHARS]
    except Exception:
        return ""


def _fetch_description_microsoft(url: str) -> str:
    """
    Microsoft career detail pages (apply.careers.microsoft.com/careers/job/{id})
    are Next.js SPAs but always include a <script type='application/ld+json'>
    with the full job description.
    """
    try:
        from bs4 import BeautifulSoup
        resp = requests.get(url, headers=_REQ_HEADERS, timeout=15)
        if not resp.ok:
            return ""
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
        ld = soup.find("script", type="application/ld+json")
        if ld and ld.string:
            data = json.loads(ld.string)
            desc_html = data.get("description", "")
            if desc_html:
                desc = html_module.unescape(desc_html)
                desc = re.sub(r"<[^>]+>", " ", desc)
                desc = desc.replace("\xa0", " ")
                return re.sub(r"\s+", " ", desc).strip()[:MAX_DESC_CHARS]
    except Exception:
        pass
    return ""


def _parse_workday_api_url(url: str):
    """Returns (base, tenant, board, path) for a Workday job URL, or None."""
    m = re.match(
        r"(https://(\w+)\.wd\d+\.myworkdayjobs\.com)/[^/]+/([^/]+)(/job/.+)",
        url,
    )
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3), m.group(4)


def _fetch_workday_description(url: str) -> str:
    """
    Workday exposes a JSON detail API at:
      /wday/cxs/{tenant}/{board}/job/{location}/{slug}
    URL format stored: https://{tenant}.wd5.myworkdayjobs.com/en-US/{Board}/job/...
    """
    parsed = _parse_workday_api_url(url)
    if not parsed:
        return ""
    base, tenant, board, path = parsed
    api_url = f"{base}/wday/cxs/{tenant}/{board}{path}"
    try:
        resp = requests.get(api_url, headers=_REQ_HEADERS, timeout=15)
        if resp.status_code == 200:
            info = resp.json().get("jobPostingInfo", {})
            desc_html = info.get("jobDescription", "")
            if desc_html:
                desc = html_module.unescape(desc_html)
                desc = re.sub(r"<[^>]+>", " ", desc)
                desc = desc.replace("\xa0", " ")
                desc = re.sub(r"\s+", " ", desc).strip()
                return desc[:MAX_DESC_CHARS]
    except Exception:
        pass
    return ""


def _fetch_workday_locations(url: str) -> str:
    """
    Fetches the Workday detail API and returns a comma-joined location string.
    Used to resolve 'X Locations' placeholders from the search results API.
    Returns '' on failure.
    """
    parsed = _parse_workday_api_url(url)
    if not parsed:
        return ""
    base, tenant, board, path = parsed
    api_url = f"{base}/wday/cxs/{tenant}/{board}{path}"
    try:
        resp = requests.get(api_url, headers=_REQ_HEADERS, timeout=15)
        if resp.status_code == 200:
            info = resp.json().get("jobPostingInfo", {})
            # Try 'locations' array first, fall back to 'primaryLocation'
            locs = info.get("locations") or []
            if locs:
                return ", ".join(str(l) for l in locs if l)
            primary = info.get("primaryLocation", "")
            return primary
    except Exception:
        pass
    return ""


def _enrich_descriptions(jobs: list[dict], label: str) -> list[dict]:
    needs = [j for j in jobs if not j.get("description") and j.get("url")]
    if not needs:
        return jobs
    print(f"    [{label}] fetching {len(needs)} job descriptions...", flush=True)
    desc_map: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=DESC_WORKERS) as ex:
        futures = {ex.submit(_fetch_description, j["url"]): j["id"] for j in needs}
        done = 0
        for future in as_completed(futures):
            jid = futures[future]
            desc_map[jid] = future.result()
            done += 1
            if done % 25 == 0:
                print(f"    [{label}] descriptions: {done}/{len(needs)}", flush=True)
    for job in jobs:
        if not job.get("description") and job["id"] in desc_map:
            job["description"] = desc_map[job["id"]]
    fetched = sum(1 for j in jobs if j.get("description"))
    print(f"    [{label}] {fetched}/{len(jobs)} jobs have descriptions", flush=True)
    return jobs

# ─────────────────────────────────────────────────────────────────────────────
# Shared browser launch helper
# ─────────────────────────────────────────────────────────────────────────────

def _launch_browser(playwright):
    browser = playwright.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 800},
        locale="en-US",
    )
    return browser, context


# ─────────────────────────────────────────────────────────────────────────────
# NVIDIA (Workday)
# ─────────────────────────────────────────────────────────────────────────────

def scrape_nvidia() -> list[dict]:
    """
    Scrape NVIDIA's Workday board using focused search queries.
    Workday rate-limits rapid pagination; instead we run ~2 pages per
    search term across several terms to get broad AI + sales coverage.
    Each search term spawns a fresh page load to reset rate-limit state.
    """
    board_url = "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"
    api_url = "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs"

    JS = """(params) => fetch(params.url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            appliedFacets: {},
            limit: params.limit,
            offset: 0,
            searchText: params.searchText
        }),
    }).then(r => r.json())"""

    # Broad searches — empty string returns all jobs; "AI" catches AI-labelled roles
    SEARCH_TERMS = ["", "AI"]

    seen = set()
    jobs = []

    with sync_playwright() as p:
        browser, context = _launch_browser(p)

        for term in SEARCH_TERMS:
            page = context.new_page()
            print(f"    [nvidia] Searching: {term!r}...")
            try:
                page.goto(board_url, wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(1500)

                data = page.evaluate(JS, {"url": api_url, "limit": 20, "searchText": term})

                if not isinstance(data, dict) or data.get("errorCode"):
                    page.close()
                    time.sleep(3)
                    continue

                for job in (data.get("jobPostings") or []):
                    job_path = job.get("externalPath", "")
                    jid = job_path.split("/")[-1]
                    if jid and jid not in seen:
                        seen.add(jid)
                        locations = job.get("locationsText", "") or ""
                        jobs.append({
                            "id": jid,
                            "title": job.get("title", ""),
                            "department": job.get("jobFamilyGroup", ""),
                            "location": locations,  # resolved below
                            "url": f"https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite{job_path}",
                        })
            except Exception as e:
                print(f"    [nvidia] error for {term!r}: {e}")
            finally:
                page.close()
            time.sleep(2)

        browser.close()

    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# Meta
# ─────────────────────────────────────────────────────────────────────────────

def scrape_meta(ai_filter: list[str]) -> list[dict]:
    """
    Meta Careers is a React SPA — load each team filter page in a real
    browser and intercept the XHR/fetch response that contains job data.
    """
    ai_teams = [
        "Artificial Intelligence Research",
        "Machine Learning",
        "Generative AI",
        "Business Development",
        "Sales",
        "Partnerships",
    ]

    seen = set()
    jobs = []

    with sync_playwright() as p:
        browser, context = _launch_browser(p)
        page = context.new_page()

        # Intercept network responses to grab JSON job data
        captured = []

        def handle_response(response):
            if "metacareers.com" in response.url and response.status == 200:
                ct = response.headers.get("content-type", "")
                if "json" in ct:
                    try:
                        data = response.json()
                        if data:
                            captured.append(data)
                    except Exception:
                        pass

        page.on("response", handle_response)

        for team in ai_teams:
            encoded = team.replace(" ", "%20")
            # Meta moved from /jobs/ to /jobsearch in 2025
            url = f"https://www.metacareers.com/jobsearch?teams%5B0%5D={encoded}"
            print(f"    [meta] Loading: {team}...")
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
                page.wait_for_timeout(5000)  # extra wait for React hydration
                batch = _extract_meta_jobs_from_page(page, seen)
                jobs.extend(batch)
            except Exception as e:
                print(f"    [meta] error on team={team!r}: {e}")
            time.sleep(1)

        # Also try parsing any intercepted JSON responses
        for data in captured:
            for job in _parse_meta_json(data, seen):
                jobs.append(job)

        browser.close()

    return jobs


def _extract_meta_jobs_from_page(page: Page, seen: set) -> list[dict]:
    """Extract jobs from the rendered Meta Careers page DOM."""
    jobs = []
    try:
        # Meta /jobsearch uses <a href="/v2/jobs/{id}"> links
        job_links = page.query_selector_all("a[href*='/jobs/'], a[href*='/v2/jobs/']")
        for link in job_links:
            href = link.get_attribute("href") or ""
            if not href:
                continue
            if not any(p in href for p in ["/jobs/", "/v2/jobs/"]):
                continue
            title_el = link.query_selector("span, h3, h4, div[class*='title']")
            title = title_el.inner_text().strip() if title_el else link.inner_text().strip()
            if not title or len(title) < 3:
                continue
            full_url = href if href.startswith("http") else f"https://www.metacareers.com{href}"
            job_id = href.rstrip("/").split("/")[-1].split("?")[0]
            if job_id and job_id not in seen:
                seen.add(job_id)
                jobs.append({"id": job_id, "title": title, "department": "", "location": "", "url": full_url})
    except Exception as e:
        print(f"    [meta] DOM extraction error: {e}")
    return jobs


def _parse_meta_json(data: dict | list, seen: set) -> list[dict]:
    """Try to extract job data from intercepted Meta API responses."""
    jobs = []
    items = data if isinstance(data, list) else [data]
    for item in items:
        if not isinstance(item, dict):
            continue
        # Meta's GraphQL responses nest data differently
        for key in ["job_postings", "jobs", "results", "data"]:
            sub = item.get(key, [])
            if isinstance(sub, list):
                for job in sub:
                    if isinstance(job, dict) and job.get("title"):
                        jid = str(job.get("id", ""))
                        if jid and jid not in seen:
                            seen.add(jid)
                            jobs.append({
                                "id": jid,
                                "title": job.get("title", ""),
                                "department": job.get("teams", [{}])[0].get("display_name", "") if job.get("teams") else "",
                                "location": job.get("normalized_location", ""),
                                "url": job.get("url", f"https://www.metacareers.com/jobs/{jid}"),
                            })
    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# Apple
# ─────────────────────────────────────────────────────────────────────────────

def scrape_apple(ai_filter: list[str]) -> list[dict]:
    """
    Search Apple Jobs for ML/AI and sales roles using the real browser.
    Intercept the search API responses.
    """
    seen = set()
    jobs = []
    keywords = ["AI", "machine learning"]

    with sync_playwright() as p:
        browser, context = _launch_browser(p)
        page = context.new_page()

        captured_jobs = []

        def handle_response(response):
            if "jobs.apple.com/api" in response.url and response.status == 200:
                try:
                    data = response.json()
                    for job in data.get("searchResults", []):
                        captured_jobs.append(job)
                except Exception:
                    pass

        page.on("response", handle_response)

        for kw in keywords:
            url = f"https://jobs.apple.com/en-us/search?search={kw.replace(' ', '+')}&sort=relevance"
            print(f"    [apple] Searching: {kw}...")
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
                page.wait_for_timeout(2000)
            except Exception as e:
                print(f"    [apple] error for kw={kw!r}: {e}")
            time.sleep(1)

        for job in captured_jobs:
            jid = str(job.get("positionId", ""))
            if jid and jid not in seen:
                seen.add(jid)
                locations = job.get("locations", [])
                location = locations[0].get("name", "") if locations else ""
                team = job.get("team", {})
                jobs.append({
                    "id": jid,
                    "title": job.get("postingTitle", ""),
                    "department": team.get("teamName", "") if isinstance(team, dict) else "",
                    "location": location,
                    "url": f"https://jobs.apple.com/en-us/details/{jid}",
                })

        # Fallback: parse DOM if no API responses captured
        if not jobs:
            jobs = _scrape_apple_dom(page, seen, keywords[-1])

        browser.close()

    return jobs


def _scrape_apple_dom(page: Page, seen: set, last_keyword: str) -> list[dict]:
    jobs = []
    try:
        rows = page.query_selector_all("table tbody tr")
        for row in rows:
            link = row.query_selector("a[href*='/details/']")
            if not link:
                continue
            href = link.get_attribute("href") or ""
            title = link.inner_text().strip()
            jid = href.split("/details/")[-1].split("/")[0] if "/details/" in href else ""
            full_url = href if href.startswith("http") else f"https://jobs.apple.com{href}"
            if jid and jid not in seen:
                seen.add(jid)
                jobs.append({"id": jid, "title": title, "department": "", "location": "", "url": full_url})
    except Exception as e:
        print(f"    [apple] DOM fallback error: {e}")
    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# ByteDance
# ─────────────────────────────────────────────────────────────────────────────

def scrape_bytedance(ai_filter: list[str]) -> list[dict]:
    """
    Intercept ByteDance's internal search API responses using a real browser.
    """
    seen = set()
    jobs = []
    captured = []
    keywords = ["AI", "machine learning"]

    with sync_playwright() as p:
        browser, context = _launch_browser(p)
        page = context.new_page()

        def handle_response(response):
            if "jobs.bytedance.com" in response.url and response.status == 200:
                ct = response.headers.get("content-type", "")
                if "json" in ct:
                    try:
                        data = response.json()
                        batch = data.get("data", {}).get("job_post_list", [])
                        if batch:
                            captured.extend(batch)
                    except Exception:
                        pass

        page.on("response", handle_response)

        for kw in keywords:
            url = f"https://jobs.bytedance.com/en/position?keywords={kw.replace(' ', '+')}"
            print(f"    [bytedance] Searching: {kw}...")
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
                page.wait_for_timeout(2000)
            except Exception as e:
                print(f"    [bytedance] error for kw={kw!r}: {e}")
            time.sleep(1)

        for job in captured:
            jid = str(job.get("id", ""))
            if jid and jid not in seen:
                seen.add(jid)
                city_info = job.get("city_info", {}) or {}
                location = city_info.get("city_name", "") if isinstance(city_info, dict) else ""
                dept = job.get("job_category", {})
                description = job.get("description", "") or job.get("requirement", "")
                description = re.sub(r"\s+", " ", description).strip()[:MAX_DESC_CHARS]
                jobs.append({
                    "id": jid,
                    "title": job.get("title", ""),  # field is "title" not "job_title"
                    "department": dept.get("name", "") if isinstance(dept, dict) else "",
                    "location": location,
                    "url": f"https://jobs.bytedance.com/en/position/{jid}/detail",
                    "description": description,
                })

        browser.close()

    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# Microsoft
# ─────────────────────────────────────────────────────────────────────────────

def scrape_microsoft(ai_filter: list[str]) -> list[dict]:
    """
    Use Microsoft's careers API (apply.careers.microsoft.com) directly.
    A single broad 'AI' search + pagination covers everything relevant.
    No browser needed — the API is publicly accessible.
    """
    BASE = "https://apply.careers.microsoft.com/api/pcsx/search"
    API_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Referer": "https://apply.careers.microsoft.com/",
    }
    seen: set[str] = set()
    jobs: list[dict] = []
    fetched = 0

    print(f"    [microsoft] Searching 'AI' (no cap — paginating to completion)...", flush=True)
    while True:
        params = {
            "domain": "microsoft.com",
            "query": "AI",
            "location": "",
            "start": fetched,
            "sort_by": "relevance",
        }
        try:
            resp = requests.get(BASE, params=params, headers=API_HEADERS, timeout=20)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            positions = data.get("positions", [])
            if not positions:
                break
            for pos in positions:
                jid = str(pos.get("id", ""))
                if jid and jid not in seen:
                    seen.add(jid)
                    locs = pos.get("standardizedLocations") or pos.get("locations") or []
                    jobs.append({
                        "id": jid,
                        "title": pos.get("name", ""),
                        "department": pos.get("department", ""),
                        "location": locs[0] if locs else "",
                        "url": f"https://apply.careers.microsoft.com{pos.get('positionUrl', '')}",
                    })
            fetched += len(positions)
            total = data.get("count", 0)
            if fetched % 100 == 0:
                print(f"    [microsoft] {fetched}/{total} fetched...", flush=True)
            if fetched >= total:
                break
            time.sleep(0.3)
        except Exception as e:
            print(f"    [microsoft] error at start={fetched}: {e}")
            break

    print(f"    [microsoft] {len(jobs)} unique jobs found", flush=True)
    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────────────────────────────────────

def fetch_jobs(scraper_name: str, ai_filter: list[str] = None) -> list[dict]:
    ai_filter = ai_filter or []
    if scraper_name == "nvidia":
        jobs = scrape_nvidia()
    elif scraper_name == "meta":
        jobs = scrape_meta(ai_filter)
    elif scraper_name == "apple":
        jobs = scrape_apple(ai_filter)
    elif scraper_name == "bytedance":
        jobs = scrape_bytedance(ai_filter)
    elif scraper_name == "microsoft":
        jobs = scrape_microsoft(ai_filter)
    else:
        raise ValueError(f"Unknown playwright scraper: {scraper_name}")
    return _enrich_descriptions(jobs, scraper_name)
