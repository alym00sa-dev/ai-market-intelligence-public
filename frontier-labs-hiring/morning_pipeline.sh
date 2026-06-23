#!/usr/bin/env bash
# Morning Opus pipeline for the 06-22 re-scrape.
#
# Prereq: scraper.py --no-classify already produced staging/2026-06-22/jobs_raw.json.
# This runs the rest: classify (Haiku) -> vertical+social (Opus) -> track_changes
# (diff vs the promoted 06-14 baseline) -> summaries+shift (Opus).
#
# It carries the live baseline ledger/trends/snapshots into the staging dir first,
# so track_changes computes a genuine week-over-week diff. It does NOT promote —
# review the output, then copy staging -> public/data separately.
#
# Usage:  bash morning_pipeline.sh
set -euo pipefail

S=staging/2026-06-22
P=../public/data

# API key from ../../.env (repo parent) or already-exported env
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  export ANTHROPIC_API_KEY="$(python3 -c "from dotenv import dotenv_values; print(dotenv_values('../../.env').get('ANTHROPIC_API_KEY',''))")"
fi
[ -z "${ANTHROPIC_API_KEY:-}" ] && { echo "ANTHROPIC_API_KEY not set"; exit 1; }

[ -f "$S/jobs_raw.json" ] || { echo "missing $S/jobs_raw.json — run the scrape first"; exit 1; }

echo "[$(date +%H:%M:%S)] === carry baseline ledger/trends/snapshots into staging ==="
mkdir -p "$S/snapshots"
cp "$P/job_ledger.json"     "$S/job_ledger.json"
cp "$P/weekly_trends.json"  "$S/weekly_trends.json"
cp "$P/snapshots/"*.json.gz "$S/snapshots/" 2>/dev/null || true

echo "[$(date +%H:%M:%S)] === STEP 1/4: classify (Haiku) ==="
python3 -u run_classifier.py --input "$S/jobs_raw.json" --output "$S/jobs.json"

echo "[$(date +%H:%M:%S)] === STEP 2/4: vertical + social (Opus) ==="
python3 -u vertical_classifier.py --input "$S/jobs.json"

echo "[$(date +%H:%M:%S)] === STEP 3/4: track_changes (diff vs 06-14 baseline) ==="
python3 -u track_changes.py --data-dir "$S"

echo "[$(date +%H:%M:%S)] === STEP 4/4: summaries + shift narratives (Opus) ==="
python3 -u run_summarizer.py --input "$S/jobs.json"

echo "[$(date +%H:%M:%S)] === MORNING PIPELINE COMPLETE ==="
echo "Review $S/jobs.json, then promote: cp $S/{jobs.json,job_ledger.json,weekly_trends.json} $P/ && cp $S/snapshots/*.json.gz $P/snapshots/"
