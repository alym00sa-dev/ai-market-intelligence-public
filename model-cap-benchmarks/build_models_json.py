"""
Merge Artificial Analysis + LLM Stats data into a single models.json
for the Frontier Model Tracking dashboard view.

Output: ai-market-intelligence-dashboard/public/data/models.json

Usage:
  python build_models_json.py
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

AA_FILE   = Path(__file__).parent / "artificial-analysis/data/llms_models.json"
LS_FILE   = Path(__file__).parent / "llm-stats/data/models.json"
RANK_FILE = Path(__file__).parent / "llm-stats/data/rankings.json"
OUT_FILE  = Path(__file__).parent.parent / "ai-market-intelligence-dashboard/public/data/models.json"

# ── Org → country mapping ─────────────────────────────────────────────────────

ORG_COUNTRY: dict[str, str] = {
    # United States
    "anthropic":          "US", "openai":            "US",
    "google":             "US", "meta":               "US",
    "microsoft":          "US", "microsoft azure":    "US",
    "amazon":             "US", "nvidia":             "US",
    "xai":                "US", "x ai":               "US",
    "allen institute for ai": "US", "liquid ai":      "US",
    "nous research":      "US", "databricks":         "US",
    "perplexity":         "US", "cohere":             "US",  # HQ SF
    "arcee ai":           "US", "snowflake":          "US",
    "servicenow":         "US", "motif technologies": "US",
    "prime intellect":    "US", "longcat":            "US",
    "deep cogito":        "US", "inclusionai":        "US",
    # China
    "alibaba":            "CN", "deepseek":           "CN",
    "bytedance seed":     "CN", "bytedance":          "CN",
    "baidu":              "CN", "minimax":            "CN",
    "kimi":               "CN", "moonshot ai":        "CN",
    "z ai":               "CN", "stepfun":            "CN",
    "nanbeige":           "CN", "kwaikat":            "CN",
    "xiaomi":             "CN",
    # France
    "mistral":            "FR", "mistral ai":         "FR",
    # Canada
    "cohere":             "CA",  # overrides US above; HQ Toronto
    # UAE
    "tii uae":            "AE", "mbzuai institute of foundation models": "AE",
    # South Korea
    "lg ai research":     "KR", "upstage":            "KR",
    "naver":              "KR", "korea telecom":      "KR",
    # Israel
    "ai21 labs":          "IL",
    # India
    "sarvam":             "IN",
    # Switzerland
    "swiss ai initiative": "CH",
    # Inception (UAE-based)
    "inception":          "AE",
    # Reka - US
    "reka ai":            "US",
}

COUNTRY_NAMES = {
    "US": "United States", "CN": "China", "FR": "France",
    "CA": "Canada", "AE": "UAE", "KR": "South Korea",
    "IL": "Israel", "IN": "India", "CH": "Switzerland",
}

def org_country(org_name: str) -> str:
    key = org_name.lower().strip()
    return COUNTRY_NAMES.get(ORG_COUNTRY.get(key, ""), "Other")


# ── Normalise model name for fuzzy join ───────────────────────────────────────

def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


# ── Build open_weight lookup from LLM Stats ───────────────────────────────────

def build_ls_lookup(ls_models: list[dict]) -> dict[str, dict]:
    """Map normalised name → {open_weight, param_count, license, modalities}"""
    lookup: dict[str, dict] = {}
    for m in ls_models:
        key = norm(m["name"])
        lookup[key] = {
            "open_weight": m.get("open_weight"),
            "param_count": m.get("param_count"),
            "license":     (m.get("license") or {}).get("id"),
            "modalities":  m.get("modalities") or [],
        }
    return lookup


def enrich_from_ls(name: str, lookup: dict[str, dict]) -> dict:
    key = norm(name)
    if key in lookup:
        return lookup[key]
    # Try prefix match (e.g. "claude-opus-4-6" matches "claude-opus-4")
    for k, v in lookup.items():
        if key.startswith(k) or k.startswith(key):
            return v
    return {"open_weight": None, "param_count": None, "license": None, "modalities": []}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Loading source files...")
    aa_data   = json.load(open(AA_FILE))["data"]
    ls_models = json.load(open(LS_FILE))["data"]
    rankings  = json.load(open(RANK_FILE))["data"]

    ls_lookup = build_ls_lookup(ls_models)
    print(f"  AA: {len(aa_data)} models | LLM Stats: {len(ls_models)} models")

    models = []
    for m in aa_data:
        ev = m.get("evaluations") or {}
        pr = m.get("pricing") or {}
        ls = enrich_from_ls(m["name"], ls_lookup)
        org = m["model_creator"]["name"]

        models.append({
            "id":           m["id"],
            "name":         m["name"],
            "slug":         m.get("slug", ""),
            "org":          org,
            "country":      org_country(org),
            "release_date": m.get("release_date"),
            "open_weight":  ls["open_weight"],
            "param_count":  ls["param_count"],
            "license":      ls["license"],
            "modalities":   ls["modalities"],
            # Benchmarks
            "intelligence_index": ev.get("artificial_analysis_intelligence_index"),
            "coding_index":       ev.get("artificial_analysis_coding_index"),
            "math_index":         ev.get("artificial_analysis_math_index"),
            "gpqa":               ev.get("gpqa"),
            "hle":                ev.get("hle"),
            "mmlu_pro":           ev.get("mmlu_pro"),
            "livecodebench":      ev.get("livecodebench"),
            "ifbench":            ev.get("ifbench"),
            "lcr":                ev.get("lcr"),
            "aime_25":            ev.get("aime_25"),
            # Pricing (USD per 1M tokens)
            "price_input":   pr.get("price_1m_input_tokens"),
            "price_output":  pr.get("price_1m_output_tokens"),
            "price_blended": pr.get("price_1m_blended_3_to_1"),
            # Speed
            "tokens_per_sec": m.get("median_output_tokens_per_second"),
            "ttft":           m.get("median_time_to_first_token_seconds"),
        })

    # Sort by intelligence index desc (nulls last)
    models.sort(key=lambda x: (x["intelligence_index"] is None, -(x["intelligence_index"] or 0)))

    # Clean up rankings — keep only categories with ranked models
    clean_rankings = {
        cat: v for cat, v in rankings.items()
        if v.get("models")
    }

    output = {
        "built_at":    datetime.now(timezone.utc).isoformat(),
        "model_count": len(models),
        "open_count":  sum(1 for m in models if m["open_weight"] is True),
        "org_count":   len(set(m["org"] for m in models)),
        "models":      models,
        "rankings":    clean_rankings,
    }

    with open(OUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = OUT_FILE.stat().st_size // 1024
    print(f"\nSaved → {OUT_FILE}  ({size_kb} KB)")
    print(f"  {len(models)} models | {output['open_count']} open-weight | {output['org_count']} orgs")
    print(f"  {len(clean_rankings)} ranking categories")

    # Quick sanity — top 5 by intelligence
    print("\nTop 5 by intelligence index:")
    for m in models[:5]:
        ow = "open" if m["open_weight"] else ("closed" if m["open_weight"] is False else "?")
        print(f"  [{m['org']}] {m['name']}  intel={m['intelligence_index']}  {ow}  ${m['price_blended'] or '?'}/1M")


if __name__ == "__main__":
    main()
