# Funding Flow pipeline (AI-related aid $)

Tracks development funding toward **AI-related programs** and their recipients, for the
`/funding` view. Proof-of-concept.

## Sources
- **IATI** — pulled **keyless via d-portal** (`d-portal.org/q`). The official IATI Datastore
  needs a (pending) free API key for true free-text search; without it we discover AI
  candidates by pulling **AI-likely DAC sectors** then keyword+Claude filtering. This
  **undercounts** AI embedded in other sectors — swap in the keyed Datastore free-text
  query later for full breadth.
- **OECD CRS** — annual bulk file, AI-tagged the same way. *To follow.*

## Flow
1. `iati/fetch.py` — pull AI-likely sectors from d-portal, keyword pre-filter title/desc,
   attach recipient countries + amounts → `data/iati_raw.json`.
2. `tag.py` — Claude (haiku) confirms genuine AI + assigns a category. Cached by activity
   id in `data/tag_cache.json` (**committed**), so only *new* activities are ever sent to
   Claude → `data/iati_tagged.json`.
3. `build_funding_json.py` — allocate USD to recipients (by %; else "Global / multi-country"),
   aggregate by recipient/donor/category/year + donor→recipient flows → `public/data/funding.json`.

## Refresh
`.github/workflows/refresh-funding.yml` runs daily: fetch → tag (incremental) → build → commit.
Needs secret `ANTHROPIC_API_KEY` (IATI is keyless). CRS step run on-demand/annually.

## Caveats (shown in the view)
- Undercount until the IATI key enables free-text search across all sectors.
- Many activities are global/multi-country (no single recipient) — excluded from the map.
- Amounts converted EUR→USD (~1.08).
