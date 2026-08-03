# GIRAI — Genie space instructions

Paste the **General instructions** block into the FSO – AI Market Intelligence Genie space's
instructions, and add the **column descriptions** as table/column comments (or into the
space's example-SQL/notes). Source of definitions: the two GIRAI `*_dictionary.xlsx` files.

---

## General instructions (paste into Genie)

The `girai_*` tables are the **Global Index on Responsible AI (GIRAI), 2026 edition** — 135
countries scored 0–100 on how well their **governance** supports responsible AI. This is about
government policy, oversight, and civil-society engagement — **not** AI capability or compute
(use `oxford_ai_readiness` for capability/readiness).

Scoring structure:
- **Overall score = `girai`** (0–100). Always rank and compare countries on `girai`, not `girai_raw`.
  `girai = girai_raw × urai_penalty`. `girai_raw` is the score before penalising documented use of
  unacceptable-risk AI systems; `urai_penalty` is that multiplicative factor (1.0 = no penalty).
- **5 dimensions**: Inclusion & Diversity, Ethics & Sustainability, Labour & Skills, Trust & Safety,
  AI Use in Public Service.
- **3 pillars**: AI Policy (government frameworks), CSO Engagement (civil-society involvement),
  Enabling Conditions (underlying infrastructure/rights, e.g. rule of law, data protection).
- **38 thematic indicators** roll up into the dimensions (e.g. Data Protection and Privacy,
  Gender Equality, Cybersecurity, Transparency and Explainability).

Higher score = stronger responsible-AI governance. Countries not in the index were not assessed
(absence ≠ score of 0). Join everything on `iso3`. Slice by geography/economy via
`girai_country_classifications` (region, income group, developing status, GDP per capita).

Table guide:
- `girai_scores` — one row per country: `ranking`, `girai`, `girai_raw`, `urai_penalty`, the 5
  `dim_*` scores, the 3 `pillar_*` scores. **Start here for overall/dimension/pillar questions.**
- `girai_indicators` — long (country × `indicator` × `score`). Use for any single-indicator question
  ("who scores highest on Data Protection and Privacy").
- `girai_pillar_dimension_scores` — long (country × `dimension` × `pillar` × `score`). Use for
  pillar-within-dimension questions ("strong on AI Policy but weak on CSO Engagement in Trust & Safety").
- `girai_editions_comparison` — country × `indicator`, 2024 vs 2026 framework status/title/link plus
  initiative & CSO-engagement existence flags. Use for trend / "what changed since 2024" questions.
- `girai_country_classifications` — reference: `iso3` → region, subregion, developing_status,
  least_developed_countries, wb_income_group, gdp_per_capita_ppp.

---

## Column descriptions (for table/column comments)

**girai_scores**
- `ranking` — GIRAI 2026 rank, 1 = highest `girai` score.
- `girai` — overall score (0–100) after the URAI penalty; the score used to rank countries.
- `girai_raw` — overall score before the URAI penalty.
- `urai_penalty` — multiplicative penalty factor (girai = girai_raw × urai_penalty).
- `dim_*` — the 5 dimension scores (0–100).
- `pillar_*` — the 3 pillar scores (0–100).

**girai_indicators** — `indicator` = thematic indicator name; `score` = 0–100.

**girai_pillar_dimension_scores** — `pillar` ∈ {AI Policy, CSO Engagement, Enabling Conditions};
`dimension` = one of the 5 dimensions; `score` = 0–100.

**girai_editions_comparison** — `fr_status_2024/2026` = framework status that edition;
`fr_title_/fr_link_` = the framework's title/URL; `init_existence_*` / `cso_existence_*` = Yes/No
whether an initiative / CSO engagement existed that edition.

**girai_country_classifications** — `wb_income_group` = World Bank income group;
`developing_status` = Developed/Developing; `least_developed_countries` = LDC flag;
`gdp_per_capita_ppp` = GDP per capita, PPP.

---

## Example questions Genie should handle

- "Top 10 countries in the Global Index on Responsible AI 2026."
- "How does Kenya rank, and where is it weakest across the five dimensions?"
- "Average GIRAI score by World Bank income group."
- "Which developing countries score highest on Trust and Safety?"
- "Countries with the biggest URAI penalty."
- "Who scores highest on Data Protection and Privacy?" (→ `girai_indicators`)
- "Countries strong on AI Policy but weak on CSO Engagement." (→ `girai_pillar_dimension_scores`)
- "Which countries added a Trust & Safety framework between 2024 and 2026?" (→ `girai_editions_comparison`)
