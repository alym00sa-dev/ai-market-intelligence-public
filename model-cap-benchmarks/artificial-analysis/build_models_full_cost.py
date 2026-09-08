"""
Extract a full model table with the complete cost picture → data/models_full_cost.json

Superset of cost_per_task.json: same identity / open-weights / reasoning / parameters / evaluations,
but with ALL cost columns broken out:

  cost_per_task.{total,input,reasoning,answer}   — $ per Intelligence-Index task, by token type
  eval_suite_cost.{total,input,reasoning,answer} — $ to run the whole eval suite once
  token_counts.{input,output,reasoning,answer}   — tokens the eval suite consumed
  pricing.{blended_3_to_1, blended_7_to_2_to_1, input_1m, output_1m, cache_hit_1m, cache_write_1m}

Cost/token fields are null where AA hasn't run the cost eval (155/618 have cost_per_task).
Run fetch_language_models.py first to refresh the source.

Usage:
    python build_models_full_cost.py
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "data" / "language_models.json"
OUT = HERE / "data" / "models_full_cost.json"


def main():
    doc = json.loads(SRC.read_text())
    models = doc["data"]

    rows = []
    for m in models:
        creator = m.get("model_creator") or {}
        lic = m.get("licensing") or {}
        params = m.get("parameters") or {}
        cost = m.get("artificial_analysis_intelligence_index_cost") or {}
        cpt = cost.get("cost_per_task") or {}
        tok = m.get("artificial_analysis_intelligence_index_token_counts") or {}
        pr = m.get("pricing") or {}
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
            # ── cost per Intelligence-Index task ($), by token type ──
            "cost_per_task": {
                "total": cpt.get("total_cost"),
                "input": cpt.get("input_cost"),
                "reasoning": cpt.get("reasoning_cost"),
                "answer": cpt.get("answer_cost"),
            },
            # ── cost to run the full eval suite once ($) ──
            "eval_suite_cost": {
                "total": cost.get("total_cost"),
                "input": cost.get("input_cost"),
                "reasoning": cost.get("reasoning_cost"),
                "answer": cost.get("answer_cost"),
            },
            # ── tokens the eval suite consumed ──
            "token_counts": {
                "input": tok.get("input_tokens"),
                "output": tok.get("output_tokens"),
                "reasoning": tok.get("reasoning_tokens"),
                "answer": tok.get("answer_tokens"),
            },
            # ── list/API pricing ($ per 1M tokens) ──
            "pricing": {
                "blended_3_to_1": pr.get("price_1m_blended_3_to_1"),
                "blended_7_to_2_to_1": pr.get("price_1m_blended_7_to_2_to_1"),
                "input_1m": pr.get("price_1m_input_tokens"),
                "output_1m": pr.get("price_1m_output_tokens"),
                "cache_hit_1m": pr.get("price_1m_cache_hit_tokens"),
                "cache_write_1m": pr.get("price_1m_cache_write_tokens"),
            },
            "evaluations": m.get("evaluations") or {},
        })

    OUT.write_text(json.dumps({
        "fetched_at": doc.get("fetched_at"),
        "source": "artificial_analysis",
        "intelligence_index_version": doc.get("intelligence_index_version"),
        "tier": doc.get("tier"),
        "note": ("cost_per_task = $ per Intelligence-Index task; eval_suite_cost = $ per full suite run; "
                 "pricing = list $/1M tokens. Cost/token fields null where AA hasn't run the cost eval."),
        "count": len(rows),
        "models": rows,
    }, indent=1))

    n_cpt = sum(1 for r in rows if r["cost_per_task"]["total"] is not None)
    n_price = sum(1 for r in rows if r["pricing"]["blended_3_to_1"] is not None)
    print(f"wrote {OUT.name}  ({len(rows)} models)")
    print(f"  with cost_per_task: {n_cpt} | with list pricing: {n_price}")


if __name__ == "__main__":
    main()
