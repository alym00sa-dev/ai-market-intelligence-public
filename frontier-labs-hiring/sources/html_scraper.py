"""
Custom HTML scrapers for Tier-2 companies (Meta, ByteDance, SenseTime,
Amazon, Apple, Microsoft) that don't expose clean public APIs.

Each scraper returns a list of raw job dicts:
  { id, title, department, location, url }

Search terms cover both AI/technical roles AND sales/GTM roles so we
capture the full commercial picture of each company's AI hiring.
"""

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup

MAX_DESC_CHARS = 5000
DESC_WORKERS   = 10


def _fetch_description(url: str) -> str:
    """Fetch and strip plain text from a job detail page. Returns '' on failure."""
    if not url or not url.startswith("http"):
        return ""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return ""
        soup = BeautifulSoup(resp.text, "html.parser")
        # Remove nav/header/footer noise
        for tag in soup(["nav", "header", "footer", "script", "style"]):
            tag.decompose()
        # Try specific description containers first
        for sel in [
            "[class*='description']", "[class*='job-detail']",
            "[class*='content']", "[class*='posting']",
            "main", "article",
        ]:
            el = soup.select_one(sel)
            if el:
                text = re.sub(r"\s+", " ", el.get_text(" ")).strip()
                if len(text) > 100:
                    return text[:MAX_DESC_CHARS]
        # Fallback: whole body
        text = re.sub(r"\s+", " ", soup.get_text(" ")).strip()
        return text[:MAX_DESC_CHARS]
    except Exception:
        return ""


def _enrich_descriptions(jobs: list[dict], label: str) -> list[dict]:
    """Concurrently fetch descriptions for all jobs missing one."""
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

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    # Explicitly exclude zstd to avoid decompression failures on some sites
    "Accept-Encoding": "gzip, deflate, br",
}


# ─────────────────────────────────────────────────────────────────────────────
# Meta
# ─────────────────────────────────────────────────────────────────────────────

def scrape_meta(ai_filter: list[str]) -> list[dict]:
    """
    Search Meta Careers by AI teams AND by sales/GTM keywords.
    Meta's search requires literal bracket syntax: ?teams[0]=...
    We build URLs manually to avoid requests double-encoding brackets.
    """
    ai_teams = [
        "Artificial Intelligence Research",
        "Machine Learning",
        "Applied Machine Learning",
        "Generative AI",
        "Business Development",
        "Sales",
    ]
    extra_keywords = [kw for kw in ai_filter if "sales" in kw.lower() or "gtm" in kw.lower() or "partner" in kw.lower()]

    seen = set()
    jobs = []

    # Pull by team — build URL manually so brackets aren't double-encoded
    for team in ai_teams:
        encoded_team = requests.utils.quote(team, safe="")
        url = f"https://www.metacareers.com/jobs/?teams%5B0%5D={encoded_team}"
        jobs, seen = _meta_fetch(url, jobs, seen)
        time.sleep(1)

    # Pull by keyword for sales/GTM terms
    for kw in extra_keywords:
        url = f"https://www.metacareers.com/jobs/?q={requests.utils.quote(kw)}"
        jobs, seen = _meta_fetch(url, jobs, seen)
        time.sleep(1)

    return jobs


def _meta_fetch(url: str, jobs: list, seen: set) -> tuple[list, set]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        for job in _parse_meta_html(resp.text):
            if job["id"] not in seen:
                seen.add(job["id"])
                jobs.append(job)
    except Exception as e:
        print(f"    [meta] error fetching {url}: {e}")
    return jobs, seen


def _parse_meta_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Strategy 1: structured JSON-LD job postings
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            items = [data] if isinstance(data, dict) else (data if isinstance(data, list) else [])
            for item in items:
                if isinstance(item, dict) and item.get("@type") == "JobPosting":
                    jobs.append({
                        "id": item.get("url", "").split("/")[-1],
                        "title": item.get("title", ""),
                        "department": item.get("occupationalCategory", ""),
                        "location": _meta_location(item),
                        "url": item.get("url", ""),
                    })
        except (json.JSONDecodeError, AttributeError):
            continue

    # Strategy 2: job cards from HTML
    if not jobs:
        for card in soup.find_all(["li", "div"], {"data-testid": re.compile(r"job")}):
            link = card.find("a", href=True)
            title_el = card.find(["h3", "h4", "a"])
            if not title_el or not link:
                continue
            href = link["href"]
            full_url = href if href.startswith("http") else f"https://www.metacareers.com{href}"
            jobs.append({
                "id": full_url.split("/")[-1],
                "title": title_el.get_text(strip=True),
                "department": "",
                "location": "",
                "url": full_url,
            })

    return jobs


def _meta_location(data: dict) -> str:
    loc = data.get("jobLocation", {})
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    address = loc.get("address", {})
    if isinstance(address, dict):
        city = address.get("addressLocality", "")
        state = address.get("addressRegion", "")
        return f"{city}, {state}".strip(", ")
    return ""


# ─────────────────────────────────────────────────────────────────────────────
# ByteDance
# ─────────────────────────────────────────────────────────────────────────────

def scrape_bytedance(ai_filter: list[str]) -> list[dict]:
    """
    Try ByteDance's internal search API, fall back to HTML scraping.
    Searches for both technical AI and sales/GTM terms.
    """
    search_url = "https://jobs.bytedance.com/api/v1/search/jobs"
    seen = set()
    jobs = []

    for kw in ai_filter:
        try:
            params = {"keyword": kw, "limit": 50, "offset": 0, "portal": "1"}
            resp = requests.get(search_url, params=params, headers=HEADERS, timeout=30)
            if resp.status_code == 200 and "application/json" in resp.headers.get("content-type", ""):
                data = resp.json()
                for job in data.get("data", {}).get("job_post_list", []):
                    jid = str(job.get("id", ""))
                    if jid not in seen:
                        seen.add(jid)
                        city_list = job.get("city_list", [])
                        location = city_list[0].get("city_name", "") if city_list else ""
                        jobs.append({
                            "id": jid,
                            "title": job.get("job_title", ""),
                            "department": job.get("job_category", {}).get("name", ""),
                            "location": location,
                            "url": f"https://jobs.bytedance.com/en/position/{jid}/detail",
                        })
            else:
                for job in _scrape_bytedance_html(kw):
                    if job["id"] not in seen:
                        seen.add(job["id"])
                        jobs.append(job)
        except Exception as e:
            print(f"    [bytedance] error for kw={kw!r}: {e}")
        time.sleep(1)

    return jobs


def _scrape_bytedance_html(keyword: str) -> list[dict]:
    url = f"https://jobs.bytedance.com/en/position?keyword={requests.utils.quote(keyword)}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        jobs = []
        for card in soup.find_all(["li", "div"], {"class": re.compile(r"position|job|card")}):
            title_el = card.find(["h3", "h4", "a"])
            link = card.find("a", href=True)
            if not title_el:
                continue
            href = link["href"] if link else ""
            full_url = href if href.startswith("http") else f"https://jobs.bytedance.com{href}"
            jid = full_url.split("/")[-2] if "/detail" in full_url else full_url.split("/")[-1]
            jobs.append({
                "id": jid,
                "title": title_el.get_text(strip=True),
                "department": "",
                "location": "",
                "url": full_url,
            })
        return jobs
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# SenseTime
# ─────────────────────────────────────────────────────────────────────────────

def scrape_sensetime(ai_filter: list[str]) -> list[dict]:
    """SenseTime is small enough to pull all roles from the English careers page."""
    url = "https://joinus.sensetime.com/en"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return _parse_sensetime_html(resp.text)
    except Exception as e:
        print(f"    [sensetime] error: {e}")
        return []


def _parse_sensetime_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for card in soup.find_all(["li", "div", "tr"], {"class": re.compile(r"job|position|vacancy|list.item|row")}):
        title_el = card.find(["h3", "h4", "h5", "strong", "a"])
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if len(title) < 3:
            continue
        link = card.find("a", href=True)
        href = link["href"] if link else ""
        full_url = href if href.startswith("http") else f"https://joinus.sensetime.com{href}"
        dept_el = card.find(["span", "p", "div"], {"class": re.compile(r"dept|team|category")})
        loc_el = card.find(["span", "p", "div"], {"class": re.compile(r"loc|city|location")})
        jobs.append({
            "id": full_url.split("/")[-1] or title.replace(" ", "-").lower()[:40],
            "title": title,
            "department": dept_el.get_text(strip=True) if dept_el else "",
            "location": loc_el.get_text(strip=True) if loc_el else "",
            "url": full_url,
        })
    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# Amazon AGI
# ─────────────────────────────────────────────────────────────────────────────

def scrape_amazon(ai_filter: list[str]) -> list[dict]:
    """
    Amazon Jobs public JSON search API.
    Single broad 'AI' search, paginated via offset until all results fetched.
    """
    search_url = "https://www.amazon.jobs/en/search.json"
    PAGE_SIZE = 100
    seen: set[str] = set()
    jobs: list[dict] = []
    offset = 0
    total = None

    while True:
        try:
            resp = requests.get(
                search_url,
                params={"base_query": "AI", "result_limit": PAGE_SIZE, "offset": offset},
                headers=HEADERS,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            if total is None:
                total = data.get("hits", 0)
                print(f"    [amazon] {total} total hits for 'AI'", flush=True)
            batch = data.get("jobs", [])
            if not batch:
                break
            for job in batch:
                jid = str(job.get("id", ""))
                if jid and jid not in seen:
                    seen.add(jid)
                    jobs.append(_amazon_job(job))
            offset += len(batch)
            print(f"    [amazon] fetched {offset}/{total}, unique so far: {len(jobs)}", flush=True)
            if offset >= total:
                break
            time.sleep(0.5)
        except Exception as e:
            print(f"    [amazon] error at offset={offset}: {e}")
            break

    return jobs


def _amazon_job(job: dict) -> dict:
    team = job.get("team", {})
    department = team.get("label", "") if isinstance(team, dict) else ""
    # Amazon search API returns full description + basic_qualifications — use both
    desc = job.get("description") or job.get("description_short") or ""
    qual = job.get("basic_qualifications") or ""
    desc = re.sub(r"<[^>]+>", " ", desc)
    desc = re.sub(r"\s+", " ", desc).strip()
    qual = re.sub(r"<[^>]+>", " ", qual)
    qual = re.sub(r"\s+", " ", qual).strip()
    full_desc = (desc + (" | Qualifications: " + qual if qual else "")).strip()[:MAX_DESC_CHARS]
    return {
        "id": str(job.get("id", "")),
        "title": job.get("title", ""),
        "department": department,
        "location": job.get("normalized_location", job.get("location", "")),
        "url": f"https://www.amazon.jobs{job.get('job_path', '')}",
        "description": full_desc,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Apple ML Research
# ─────────────────────────────────────────────────────────────────────────────

def scrape_apple(ai_filter: list[str]) -> list[dict]:
    """
    Apple Jobs has a search API at /api/role/search.
    We search for both ML/AI research and enterprise/sales terms.
    """
    search_url = "https://jobs.apple.com/api/role/search"
    seen = set()
    jobs = []

    for kw in ai_filter:
        try:
            params = {"query": kw, "page": 1}
            resp = requests.get(search_url, params=params, headers=HEADERS, timeout=30)
            if resp.status_code == 200 and "application/json" in resp.headers.get("content-type", ""):
                for job in resp.json().get("searchResults", []):
                    jid = str(job.get("positionId", ""))
                    if jid not in seen:
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
            else:
                for job in _scrape_apple_html(kw):
                    if job["id"] not in seen:
                        seen.add(job["id"])
                        jobs.append(job)
        except Exception as e:
            print(f"    [apple] kw={kw!r} error: {e}")
        time.sleep(1)

    return jobs


def _scrape_apple_html(keyword: str) -> list[dict]:
    url = f"https://jobs.apple.com/en-us/search?search={requests.utils.quote(keyword)}&sort=relevance"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        jobs = []
        for tr in soup.select("tbody tr"):
            cells = tr.find_all("td")
            if not cells:
                continue
            link = cells[0].find("a", href=True)
            if not link:
                continue
            href = link["href"]
            full_url = href if href.startswith("http") else f"https://jobs.apple.com{href}"
            jid = href.split("/details/")[-1].split("/")[0] if "/details/" in href else href.split("/")[-1]
            jobs.append({
                "id": jid,
                "title": link.get_text(strip=True),
                "department": cells[1].get_text(strip=True) if len(cells) > 1 else "",
                "location": cells[2].get_text(strip=True) if len(cells) > 2 else "",
                "url": full_url,
            })
        return jobs
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Microsoft Research
# ─────────────────────────────────────────────────────────────────────────────

def scrape_microsoft(ai_filter: list[str]) -> list[dict]:
    """
    Scrape Microsoft Careers search results page with BeautifulSoup.
    The internal API has SSL certificate issues; HTML scraping is more reliable.
    """
    seen = set()
    jobs = []

    for kw in ai_filter:
        url = f"https://careers.microsoft.com/v2/global/en/search?q={requests.utils.quote(kw)}&l=en_us"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            # Microsoft's careers page embeds job data as JSON-LD or in script tags
            for job in _parse_microsoft_html(resp.text):
                if job["id"] not in seen:
                    seen.add(job["id"])
                    jobs.append(job)
        except Exception as e:
            print(f"    [microsoft] kw={kw!r} error: {e}")
        time.sleep(1)

    return jobs


def _parse_microsoft_html(html: str) -> list[dict]:
    import json as _json
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Strategy 1: JSON-LD job postings
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = _json.loads(script.string or "")
            items = [data] if isinstance(data, dict) else (data if isinstance(data, list) else [])
            for item in items:
                if isinstance(item, dict) and item.get("@type") == "JobPosting":
                    job_url = item.get("url", "")
                    jobs.append({
                        "id": job_url.split("/")[-1] or item.get("title", "").replace(" ", "-")[:40],
                        "title": item.get("title", ""),
                        "department": item.get("occupationalCategory", ""),
                        "location": _meta_location(item),
                        "url": job_url,
                    })
        except Exception:
            continue

    # Strategy 2: job cards
    if not jobs:
        for card in soup.find_all(["li", "div"], {"class": re.compile(r"job|position|card|result")}):
            title_el = card.find(["h3", "h4", "a"])
            link = card.find("a", href=True)
            if not title_el or not link:
                continue
            href = link["href"]
            full_url = href if href.startswith("http") else f"https://careers.microsoft.com{href}"
            jobs.append({
                "id": full_url.split("/")[-1],
                "title": title_el.get_text(strip=True),
                "department": "",
                "location": "",
                "url": full_url,
            })

    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# Google Careers
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_description_google(url: str) -> str:
    """Google-specific description fetch: targets the 'About the job' container."""
    if not url or not url.startswith("http"):
        return ""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return ""
        soup = BeautifulSoup(resp.text, "html.parser")

        # Primary: Google's obfuscated description class (stable as of 2026-04)
        el = soup.select_one(".aG5W3")
        if el:
            text = re.sub(r"\s+", " ", el.get_text(" ")).strip()
            if len(text) > 100:
                return text[:MAX_DESC_CHARS]

        # Fallback: find any block that starts with "About the job"
        for div in soup.find_all(["div", "section"]):
            text = re.sub(r"\s+", " ", div.get_text(" ")).strip()
            if text.startswith("About the job") and len(text) > 200:
                return text[:MAX_DESC_CHARS]

    except Exception:
        pass
    return ""


def _enrich_google_descriptions(jobs: list[dict]) -> list[dict]:
    """Concurrently fetch descriptions using the Google-specific fetcher."""
    needs = [j for j in jobs if not j.get("description") and j.get("url")]
    if not needs:
        return jobs
    print(f"    [google] fetching {len(needs)} job descriptions...", flush=True)
    desc_map: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=DESC_WORKERS) as ex:
        futures = {ex.submit(_fetch_description_google, j["url"]): j["id"] for j in needs}
        done = 0
        for future in as_completed(futures):
            jid = futures[future]
            desc_map[jid] = future.result()
            done += 1
            if done % 25 == 0:
                print(f"    [google] descriptions: {done}/{len(needs)}", flush=True)
    for job in jobs:
        if not job.get("description") and job["id"] in desc_map:
            job["description"] = desc_map[job["id"]]
    fetched = sum(1 for j in jobs if j.get("description"))
    print(f"    [google] {fetched}/{len(jobs)} jobs have descriptions", flush=True)
    return jobs


def scrape_google(ai_filter: list[str]) -> list[dict]:
    """
    Scrape Google Careers for AI roles (all Google orgs: Google, YouTube, DeepMind, etc.).
    The page is server-side rendered — no browser needed.
    Paginates through ?q=AI&page=N until Google returns no more results (no artificial cap).
    """
    BASE_URL = "https://www.google.com/about/careers/applications/jobs/results/"

    seen: set[str] = set()
    jobs: list[dict] = []
    page_num = 1

    while True:
        try:
            resp = requests.get(
                BASE_URL,
                params={"q": "AI", "page": page_num},
                headers=HEADERS,
                timeout=20,
            )
            resp.raise_for_status()
            page_jobs = _parse_google_html(resp.text)
            if not page_jobs:
                print(f"    [google] no jobs on page {page_num}, done", flush=True)
                break
            new_jobs = [j for j in page_jobs if j["id"] not in seen]
            if not new_jobs:
                # All jobs on this page already seen — end of unique results
                print(f"    [google] page {page_num}: no new jobs, done", flush=True)
                break
            for job in new_jobs:
                seen.add(job["id"])
                jobs.append(job)
            print(f"    [google] page {page_num}: {len(new_jobs)} new listings, total: {len(jobs)}", flush=True)
            page_num += 1
            time.sleep(0.8)
        except Exception as e:
            print(f"    [google] error on page {page_num}: {e}")
            break

    return _enrich_google_descriptions(jobs)


_GOOGLE_FILTER_HEADINGS = {
    "Locations", "Experience", "Skills & qualifications",
    "Degree", "Job types", "Organizations", "Sort by",
}


def _parse_google_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for li in soup.find_all("li"):
        h3 = li.find("h3")
        if not h3:
            continue
        title = h3.get_text(strip=True)
        if not title or title in _GOOGLE_FILTER_HEADINGS:
            continue

        a = li.find("a", href=True)
        href = a["href"] if a else ""
        # href: "jobs/results/84251653611365062-ai-architect-..."
        slug = href.split("/")[-1] if href else ""
        job_id = slug.split("-")[0] if slug else ""
        if not job_id:
            continue

        full_url = (
            f"https://www.google.com/about/careers/applications/{href}"
            if href and not href.startswith("http") else href
        )

        # Spans: ['corporate_fare\nGoogle', 'Google', 'place\nCity, Country', 'City, Country', ...]
        spans = [s.get_text(strip=True) for s in li.find_all("span") if s.get_text(strip=True)]
        company, location = "", ""
        prev_icon = None
        for s in spans:
            if s.startswith("corporate_fare"):
                prev_icon = "company"
            elif s.startswith("place"):
                prev_icon = "location"
            elif s.startswith("bar_chart"):
                prev_icon = None
            elif prev_icon == "company" and not company:
                company = s
                prev_icon = None
            elif prev_icon == "location" and not location:
                location = s
                prev_icon = None

        jobs.append({
            "id": job_id,
            "title": title,
            "department": company,  # Google/YouTube/DeepMind/etc.
            "location": location,
            "url": full_url,
        })

    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# iCIMS (generic — works for any iCIMS-hosted career site)
# ─────────────────────────────────────────────────────────────────────────────

def scrape_icims(base_url: str) -> list[dict]:
    """
    Scrape any iCIMS-hosted career page (e.g. careers-chai.icims.com).
    Paginates via ?pr=N&in_iframe=1, extracts job links, fetches each detail page.

    base_url example: "https://careers-chai.icims.com"
    """
    from urllib.parse import urlparse, urljoin
    import html as html_lib

    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    seen: set[str] = set()
    job_links: list[tuple[str, str]] = []  # (job_id, full_url)

    # ── Step 1: paginate search to collect all job links ──────────────────────
    page = 0
    while True:
        url = f"{origin}/jobs/search?pr={page}&in_iframe=1"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            resp.raise_for_status()
            html = resp.text
        except Exception as e:
            print(f"    [icims] page {page} error: {e}")
            break

        # Job links: full absolute URLs like https://careers-X.icims.com/jobs/{id}/{slug}/job
        matches = re.findall(r'href="(' + re.escape(origin) + r'/jobs/(\d+)/[^"]+/job[^"]*)"', html)
        new_on_page = 0
        for href, job_id in matches:
            if job_id not in seen:
                seen.add(job_id)
                clean = html_lib.unescape(href.split("?")[0]) + "?in_iframe=1"
                job_links.append((job_id, clean))
                new_on_page += 1

        has_next = 'rel="next"' in html
        print(f"    [icims] page {page}: {new_on_page} new jobs (total {len(job_links)})", flush=True)

        if not has_next or new_on_page == 0:
            break
        page += 1
        time.sleep(0.4)

    if not job_links:
        return []

    # ── Step 2: fetch each job detail page ───────────────────────────────────
    print(f"    [icims] fetching {len(job_links)} job detail pages...", flush=True)

    def fetch_detail(job_id: str, detail_url: str) -> dict:
        try:
            resp = requests.get(detail_url, headers=HEADERS, timeout=20)
            if resp.status_code != 200:
                return {"id": job_id, "url": detail_url, "title": "", "department": "", "location": "", "description": ""}
            html = resp.text
            soup = BeautifulSoup(html, "html.parser")

            # Title
            h1 = soup.find("h1")
            title = h1.get_text(strip=True) if h1 else ""

            # Structured header fields (dt/dd pairs)
            location, department = "", ""
            for dt in soup.find_all("dt"):
                label = dt.get_text(strip=True).lower()
                dd = dt.find_next_sibling("dd")
                if not dd:
                    continue
                value = re.sub(r"\s+", " ", dd.get_text(" ")).strip()
                if "country" in label or "location" in label or "city" in label:
                    location = value
                elif "department" in label or "team" in label or "category" in label:
                    department = value

            # Description: Responsibilities + Qualifications only
            # iCIMS renders each section twice (label + duplicate containing prior text),
            # so filter to short names only. Skip "Overview" — always generic boilerplate.
            KEEP_SECTIONS = {"Responsibilities", "Qualifications"}
            desc_parts = []
            for section in soup.find_all(class_="iCIMS_InfoMsg"):
                name = section.get_text(strip=True)
                if name not in KEEP_SECTIONS:
                    continue
                container = section.find_next(class_="iCIMS_Expandable_Text")
                if container:
                    text = re.sub(r"<[^>]+>", " ", str(container))
                    text = re.sub(r"\s+", " ", text).strip()
                    if text:
                        desc_parts.append(f"{name}: {text}")
            description = " | ".join(desc_parts)[:MAX_DESC_CHARS]

            return {
                "id": job_id,
                "title": title,
                "department": department,
                "location": location,
                "url": detail_url.replace("?in_iframe=1", ""),
                "description": description,
            }
        except Exception as e:
            return {"id": job_id, "url": detail_url, "title": "", "department": "", "location": "", "description": ""}

    jobs = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch_detail, jid, url): jid for jid, url in job_links}
        done = 0
        for future in as_completed(futures):
            jobs.append(future.result())
            done += 1
            if done % 10 == 0:
                print(f"    [icims] detail pages: {done}/{len(job_links)}", flush=True)

    return jobs


# ─────────────────────────────────────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────────────────────────────────────

SCRAPERS = {
    "meta": scrape_meta,
    "bytedance": scrape_bytedance,
    "sensetime": scrape_sensetime,
    "amazon": scrape_amazon,
    "apple": scrape_apple,
    "microsoft": scrape_microsoft,
    "google": scrape_google,
}


def fetch_jobs(scraper_name: str, ai_filter: list[str]) -> list[dict]:
    scraper_fn = SCRAPERS.get(scraper_name)
    if not scraper_fn:
        raise ValueError(f"Unknown HTML scraper: {scraper_name}")
    jobs = scraper_fn(ai_filter)
    # Google manages its own description enrichment (uses a site-specific fetcher)
    if scraper_name == "google":
        return jobs
    return _enrich_descriptions(jobs, scraper_name)
