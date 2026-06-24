"""
Keyless IATI fetch via d-portal (no API key needed).

Free-text search is key-only on the official Datastore, so we discover AI candidates
by pulling AI-likely DAC sectors, keyword pre-filtering title/description, then (in
tag.py) letting Claude confirm. NOTE: this under-counts AI embedded in non-listed
sectors — a free IATI key would unlock true free-text search for full breadth.

Output: funding-flows/data/iati_raw.json  (AI keyword candidates, normalized)
"""
import json, os, time, urllib.request, urllib.parse

Q = "https://d-portal.org/q?"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "iati_raw.json")

# AI-likely DAC purpose/sector codes to bound the candidate pull (keyless).
SECTORS = {
    "22040": "ICT",
    "43082": "Research/scientific institutions",
    "11420": "Higher education",
    "12182": "Medical research",
    "31182": "Agricultural research",
    "15110": "Public sector policy & admin",
    "16062": "Statistical capacity building",
    "25010": "Business support / private sector",
}

AI_TERMS = ["artificial intelligence", " ai ", " ai-", "machine learning", "deep learning",
            "neural network", "large language model", " llm", "natural language processing",
            "computer vision", "predictive analytics", "algorithmic", "data science",
            "generative ai", "foundation model", "chatbot", "automated decision",
            "ai-powered", "ai for", "ml model"]

def dq(select, frm, limit=2000, **filters):
    url = Q + urllib.parse.urlencode({"select": select, "from": frm, "limit": str(limit), "form": "json", **filters})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.loads(r.read()).get("rows", [])
        except Exception as e:
            print(f"  retry {attempt+1}: {e}")
            time.sleep(3 * (attempt + 1))
    return []

def is_ai(*txts):
    blob = " " + " ".join((t or "").lower() for t in txts) + " "
    return any(term in blob for term in AI_TERMS)

def main():
    by_aid: dict[str, dict] = {}
    for code, label in SECTORS.items():
        rows = dq("aid,reporting,reporting_ref,title,description,commitment_eur,spend_eur,day_start", "act,sector", sector_code=code)
        hits = [r for r in rows if is_ai(r.get("title"), r.get("description"))]
        print(f"sector {code} {label:32} pulled {len(rows):5} · AI hits {len(hits)}")
        for r in hits:
            by_aid.setdefault(r["aid"], {**r, "_sector": label})

    cands = list(by_aid.values())
    print(f"\nunique AI keyword candidates: {len(cands)}")

    # Recipient country (+ %) for each candidate; many global progs return none.
    out = []
    for i, r in enumerate(cands):
        crows = dq("aid,country_code,country_percent", "country", limit=20, aid=r["aid"])
        recipients = [{"iso2": c.get("country_code"), "pct": c.get("country_percent")} for c in crows if c.get("country_code")]
        amt_eur = r.get("commitment_eur") or r.get("spend_eur") or 0
        # d-portal day_start is an integer: days since 1970-01-01.
        yr = None
        if r.get("day_start") not in (None, ""):
            try:
                from datetime import date, timedelta
                yr = (date(1970, 1, 1) + timedelta(days=int(r["day_start"]))).year
                if not (2000 <= yr <= 2027): yr = None
            except Exception: pass
        out.append({
            "id": r["aid"], "source": "IATI", "donor": (r.get("reporting") or "").strip(),
            "title": (r.get("title") or "").strip(), "description": (r.get("description") or "").strip()[:1200],
            "sector": r.get("_sector"), "amount_eur": round(float(amt_eur or 0)), "year": yr,
            "recipients": recipients, "url": f"https://d-portal.org/ctrack.html?reporting_ref=#view=act&aid={urllib.parse.quote(r['aid'])}",
        })
        if (i + 1) % 25 == 0: print(f"  recipients {i+1}/{len(cands)}"); time.sleep(0.3)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"fetched_at": int(time.time()), "count": len(out), "activities": out}, open(OUT, "w"), indent=1)
    print(f"\nwrote {len(out)} candidates → {OUT}")

if __name__ == "__main__":
    main()
