"""
Extract a tidy model table from data/language_models.json → data/cost_per_task.{json,csv}

Per model: identity, creator (+country), open-weights classifier, reasoning flag, parameters
(total/active, billions), cost_per_task TOTAL only ($ per Intelligence-Index task), and all
evaluations. JSON keeps evaluations nested; CSV flattens them to one column per benchmark.

Run fetch_language_models.py first to refresh the source.

Usage:
    python build_cost_per_task.py
"""
import csv
import json
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "data" / "language_models.json"
OUT_JSON = HERE / "data" / "cost_per_task.json"
OUT_CSV = HERE / "data" / "cost_per_task.csv"


def main():
    doc = json.loads(SRC.read_text())
    models = doc["data"]

    rows = []
    for m in models:
        creator = m.get("model_creator") or {}
        lic = m.get("licensing") or {}
        params = m.get("parameters") or {}
        cost = m.get("artificial_analysis_intelligence_index_cost") or {}
        cpt = (cost.get("cost_per_task") or {}).get("total_cost")
        rows.append({
            "id": m.get("id"),
            "name": m.get("name"),
            "slug": m.get("slug"),
            "creator": creator.get("name"),
            "creator_country": creator.get("country"),
            "release_date": m.get("release_date"),
            "is_open_weights": lic.get("is_open_weights"),
            "reasoning_model": m.get("reasoning_model"),
            "params_total_b": params.get("total"),
            "params_active_b": params.get("active"),
            "context_window_tokens": m.get("context_window_tokens"),
            "cost_per_task_total_usd": cpt,
            "evaluations": m.get("evaluations") or {},
        })

    # ── JSON (evaluations nested) ──
    OUT_JSON.write_text(json.dumps({
        "fetched_at": doc.get("fetched_at"),
        "source": "artificial_analysis",
        "intelligence_index_version": doc.get("intelligence_index_version"),
        "tier": doc.get("tier"),
        "note": "cost_per_task_total_usd = blended $ per Intelligence-Index task (null if AA hasn't run it).",
        "count": len(rows),
        "models": rows,
    }, indent=1))

    # ── CSV (evaluations flattened; stable union of eval keys as columns) ──
    eval_keys = sorted({k for r in rows for k in r["evaluations"].keys()})
    base_cols = ["id", "name", "slug", "creator", "creator_country", "release_date",
                 "is_open_weights", "reasoning_model", "params_total_b", "params_active_b",
                 "context_window_tokens", "cost_per_task_total_usd"]
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(base_cols + [f"eval_{k}" for k in eval_keys])
        for r in rows:
            w.writerow([r[c] for c in base_cols] + [r["evaluations"].get(k) for k in eval_keys])

    n_cost = sum(1 for r in rows if r["cost_per_task_total_usd"] is not None)
    n_open = sum(1 for r in rows if r["is_open_weights"] is True)
    print(f"wrote {OUT_JSON.name} + {OUT_CSV.name}  ({len(rows)} models)")
    print(f"  with cost_per_task: {n_cost} | open-weights: {n_open} | closed: {len(rows) - n_open - sum(1 for r in rows if r['is_open_weights'] is None)}")
    print(f"  eval columns ({len(eval_keys)}): {eval_keys}")


if __name__ == "__main__":
    main()
