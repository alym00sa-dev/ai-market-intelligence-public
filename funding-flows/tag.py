"""
Claude tagging for funding candidates.

Keyword pre-filtering (in fetch.py) is noisy — Claude confirms whether each activity
is *genuinely* about AI/ML and assigns a category. Results are cached by activity id
(data/tag_cache.json), so only NEW candidates are ever sent to Claude. Daily runs are
near-free; the corpus is never re-classified.

Output: data/iati_tagged.json (activities with ai=true + category merged).
"""
import json, os, re, time
from dotenv import load_dotenv
import anthropic

HERE = os.path.dirname(__file__)
load_dotenv(os.path.join(HERE, "..", "..", ".env"))   # repo-parent .env (ANTHROPIC_API_KEY)
RAW_FILES = [os.path.join(HERE, "data", "iati_raw.json"), os.path.join(HERE, "data", "crs_raw.json")]
CACHE = os.path.join(HERE, "data", "tag_cache.json")
OUT = os.path.join(HERE, "data", "tagged.json")

MODEL = "claude-haiku-4-5-20251001"
BATCH = 12
CATEGORIES = ["capacity_building", "infrastructure_compute", "health_ai", "agriculture_ai",
              "governance_policy", "education_skills", "research", "financial_inclusion",
              "data_systems", "other"]

PROMPT = """You are screening international-aid activities for whether they are genuinely about ARTIFICIAL INTELLIGENCE / machine learning / data science as a core component (not just generic "digital", "ICT", or a stray mention).

For each activity return:
  - ai: true only if AI/ML/data-science is a real, central component (capacity building in AI, AI infrastructure/compute, AI for health/agriculture, AI governance/policy, ML research, etc.). false for generic connectivity, e-government, cybersecurity-only, or incidental mentions.
  - category: one of {cats} (best fit; use "other" if ai but none fit).

Activities:
{items}

Respond with ONLY a JSON array, same order, no markdown:
[{{"ai": true/false, "category": "..."}}, ...]"""

def classify(client, batch):
    items = "\n".join(f'{i+1}. [{b.get("sector")}] {b.get("title")} — {(b.get("description") or "")[:400]}' for i, b in enumerate(batch))
    for attempt in range(5):
        try:
            msg = client.messages.create(model=MODEL, max_tokens=1500,
                messages=[{"role": "user", "content": PROMPT.format(cats=", ".join(CATEGORIES), items=items)}])
            raw = re.sub(r"^```[a-z]*\n?|```$", "", msg.content[0].text.strip()).strip()
            res = json.loads(raw)
            if len(res) == len(batch):
                return res
        except Exception as e:
            print(f"  classify retry {attempt+1}: {e}"); time.sleep(4 * (attempt + 1))
    return [{"ai": False, "category": "other"} for _ in batch]

def main():
    data = []
    for f in RAW_FILES:
        if os.path.exists(f):
            data += json.load(open(f))["activities"]
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    todo = [a for a in data if a["id"] not in cache]
    print(f"{len(data)} candidates · {len(todo)} need classification ({len(data)-len(todo)} cached)")

    if todo:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=6, timeout=120.0)
        for i in range(0, len(todo), BATCH):
            batch = todo[i:i + BATCH]
            for a, r in zip(batch, classify(client, batch)):
                cache[a["id"]] = {"ai": bool(r.get("ai")), "category": r.get("category", "other")}
            print(f"  tagged {min(i+BATCH, len(todo))}/{len(todo)}")
        json.dump(cache, open(CACHE, "w"), indent=1)

    tagged = [{**a, "ai_category": cache[a["id"]]["category"]} for a in data if cache.get(a["id"], {}).get("ai")]
    json.dump({"count": len(tagged), "activities": tagged}, open(OUT, "w"), indent=1)
    print(f"\nAI-confirmed: {len(tagged)}/{len(data)} → {OUT}")
    import collections
    print("by category:", dict(collections.Counter(a["ai_category"] for a in tagged)))

if __name__ == "__main__":
    main()
