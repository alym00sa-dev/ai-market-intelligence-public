"""Explore keyless IATI access via d-portal — find AI-related aid candidates."""
import json, urllib.request, urllib.parse, sys

Q = "https://d-portal.org/q?"
def dq(select, frm, limit=500, **filters):
    params = {"select": select, "from": frm, "limit": str(limit), "form": "json", **filters}
    url = Q + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read()).get("rows", [])

AI_TERMS = ["artificial intelligence", " ai ", "machine learning", "deep learning",
            "neural network", "large language model", " llm", "natural language processing",
            "computer vision", "predictive analytics", "algorithmic", "data science",
            "generative ai", "foundation model", "chatbot", "automated decision"]

def is_ai(*txts):
    blob = " ".join((t or "").lower() for t in txts)
    blob = " " + blob + " "
    return any(term in blob for term in AI_TERMS)

# Pull ICT-sector (22040) activities with descriptions + amounts
rows = dq("aid,reporting,reporting_ref,title,description,commitment_eur,spend_eur",
          "act,sector", limit=2000, sector_code="22040")
print(f"ICT(22040) rows pulled: {len(rows)}")
cands = [r for r in rows if is_ai(r.get("title"), r.get("description"))]
print(f"AI keyword hits in ICT: {len(cands)}")
for r in cands[:8]:
    amt = r.get("commitment_eur") or r.get("spend_eur") or 0
    print(f"  €{amt:>12,.0f} | {(r.get('reporting') or '')[:26]:26} | {(r.get('title') or '')[:70]}")

# Sample recipient-country join for first candidate
if cands:
    aid = cands[0]["aid"]
    crows = dq("aid,country_code,country_percent", "country", limit=10, aid=aid)
    print(f"\nrecipient join for {aid[:40]}: {[(c.get('country_code'), c.get('country_percent')) for c in crows]}")
