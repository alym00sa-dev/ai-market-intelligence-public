"""
OECD CRS fetch (keyless bulk) via oda-reader → parquet → pyarrow.

We download the CRS bulk parquet with oda-reader (which avoids oda-data's pandas-3
schema-coercion bug), then read it with pyarrow, keyword pre-filter AI candidates on
title + descriptions, and normalize to the shared candidate schema (USD amounts).
tag.py then has Claude confirm AI-relevance; build_funding_json merges with IATI.
"""
import json, os, time
import pyarrow.dataset as ds
from oda_reader import bulk_download_crs

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
PARQUET = os.path.join(DATA, "crs_bulk.parquet")
OUT = os.path.join(DATA, "crs_raw.json")
MIN_YEAR = 2023  # focus window: the LLM/AI inflection (2023+)

AI_TERMS = ["artificial intelligence", " ai ", " ai-", "machine learning", "deep learning",
            "neural network", "large language model", " llm", "natural language processing",
            "computer vision", "predictive analytics", "algorithmic", "data science",
            "generative ai", "foundation model", "chatbot", "automated decision", "ai-powered", "ml model"]
REGION_MARKERS = ["regional", "unspecified", "developing countries", "bilateral", ", regional"]

def is_ai(*txts):
    blob = " " + " ".join((t or "").lower() for t in txts) + " "
    return any(term in blob for term in AI_TERMS)

def pick(cols, *cands):
    low = {c.lower(): c for c in cols}
    for c in cands:
        if c in low: return low[c]
    for c in cands:
        for lc, orig in low.items():
            if c in lc: return orig
    return None

def main():
    os.makedirs(DATA, exist_ok=True)
    if not os.path.exists(PARQUET):
        print("downloading CRS bulk parquet (~1GB, cached after first run)…")
        bulk_download_crs(save_to_path=PARQUET, reduced_version=False)
    dataset = ds.dataset(PARQUET)
    cols = dataset.schema.names
    print(f"CRS columns ({len(cols)}): {cols[:30]}")
    C = {k: pick(cols, *v) for k, v in {
        "title": ("project_title", "projecttitle"), "ldesc": ("long_description", "longdescription"),
        "sdesc": ("short_description", "shortdescription"), "donor": ("donor_name", "donorname"),
        "recip": ("recipient_name", "recipientname"), "purpose": ("purpose_name", "purposename", "sector_name"),
        "year": ("year",), "commit": ("usd_commitment", "commitment"), "disb": ("usd_disbursement", "disbursement"),
    }.items()}
    print("resolved:", C)
    keep = [v for v in C.values() if v]
    tbl = dataset.to_table(columns=list(dict.fromkeys(keep)))
    rows = tbl.to_pylist()
    print(f"CRS rows: {len(rows)}")

    amt_col = C["commit"] or C["disb"]
    sample = sorted(float(r[amt_col]) for r in rows[:8000] if isinstance(r.get(amt_col), (int, float)) and r.get(amt_col) and r[amt_col] > 0)
    scale = 1e6 if (sample and sample[len(sample)//2] < 5000) else 1.0  # CRS amounts are in USD millions

    out, seen = [], set()
    for i, r in enumerate(rows):
        yr = r.get(C["year"])
        try: yr = int(yr)
        except Exception: continue
        if yr < MIN_YEAR: continue
        title, ld, sd = r.get(C["title"]), r.get(C["ldesc"]), r.get(C["sdesc"])
        if not is_ai(title, ld, sd): continue
        amt = r.get(amt_col)
        amt = float(amt) * scale if isinstance(amt, (int, float)) else 0
        if amt <= 0: continue
        rname = str(r.get(C["recip"]) or "").strip()
        is_region = any(m in rname.lower() for m in REGION_MARKERS)
        title = str(title or "").strip()
        key = (str(r.get(C["donor"])), title, yr)
        if key in seen: continue
        seen.add(key)
        out.append({
            "id": f"CRS-{yr}-{i}", "source": "OECD CRS", "donor": str(r.get(C["donor"]) or "").strip(),
            "title": title, "description": str(ld or sd or "").strip()[:1200],
            "sector": str(r.get(C["purpose"]) or "").strip(), "amount_usd": round(amt), "year": yr,
            "recipients": [] if (is_region or not rname) else [{"name": rname}], "url": None,
        })
    json.dump({"fetched_at": int(time.time()), "count": len(out), "activities": out}, open(OUT, "w"), indent=1)
    print(f"wrote {len(out)} CRS AI candidates → {OUT}")

if __name__ == "__main__":
    main()
