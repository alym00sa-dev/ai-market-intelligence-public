"""
Merge tagged AI activities (IATI now; OECD CRS later) → public/data/funding.json.
Allocates each activity's USD to recipient countries (by % when present); activities
with no coded recipient country go to "Global / multi-country".
"""
import json, os, time, collections

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "data", "tagged.json")
OUT = os.path.join(HERE, "..", "public", "data", "funding.json")
EUR_USD = 1.08  # approximate; IATI amounts are converted from EUR (CRS is already USD)

# ISO2 → (ISO3, world-atlas display name) for recipient mapping / choropleth join.
ISO = {
 "BD":("BGD","Bangladesh"),"BG":("BGR","Bulgaria"),"BR":("BRA","Brazil"),"CD":("COD","Dem. Rep. Congo"),
 "CF":("CAF","Central African Rep."),"CM":("CMR","Cameroon"),"ET":("ETH","Ethiopia"),"GA":("GAB","Gabon"),
 "GH":("GHA","Ghana"),"GR":("GRC","Greece"),"ID":("IDN","Indonesia"),"IN":("IND","India"),"KE":("KEN","Kenya"),
 "KH":("KHM","Cambodia"),"NG":("NGA","Nigeria"),"PE":("PER","Peru"),"RW":("RWA","Rwanda"),"SK":("SVK","Slovakia"),
 "SN":("SEN","Senegal"),"SS":("SSD","S. Sudan"),"TD":("TCD","Chad"),"TZ":("TZA","Tanzania"),"UA":("UKR","Ukraine"),
 "UG":("UGA","Uganda"),"XK":("XKX","Kosovo"),"ZA":("ZAF","South Africa"),"ZM":("ZMB","Zambia"),"ZW":("ZWE","Zimbabwe"),
 # broader coverage for future data
 "NE":("NER","Niger"),"ML":("MLI","Mali"),"MW":("MWI","Malawi"),"MZ":("MOZ","Mozambique"),"BF":("BFA","Burkina Faso"),
 "PK":("PAK","Pakistan"),"NP":("NPL","Nepal"),"LK":("LKA","Sri Lanka"),"VN":("VNM","Vietnam"),"PH":("PHL","Philippines"),
 "EG":("EGY","Egypt"),"MA":("MAR","Morocco"),"TN":("TUN","Tunisia"),"JO":("JOR","Jordan"),"LB":("LBN","Lebanon"),
 "CO":("COL","Colombia"),"MX":("MEX","Mexico"),"BO":("BOL","Bolivia"),"NA":("NAM","Namibia"),"BW":("BWA","Botswana"),
 "SO":("SOM","Somalia"),"SD":("SDN","Sudan"),"AO":("AGO","Angola"),"CI":("CIV","Côte d'Ivoire"),"BJ":("BEN","Benin"),
 "MG":("MDG","Madagascar"),"GN":("GIN","Guinea"),"BI":("BDI","Burundi"),"TG":("TGO","Togo"),"ZM":("ZMB","Zambia"),
}
GLOBAL = "Global / multi-country"
NAME2ISO3 = {atlas: iso3 for iso3, atlas in ISO.values()}
# CRS recipient names → world-atlas display names (for the country join).
CRS_ALIAS = {
    "Democratic Republic of the Congo": "Dem. Rep. Congo", "Tanzania": "Tanzania", "Viet Nam": "Vietnam",
    "Lao People's Democratic Republic": "Laos", "Syrian Arab Republic": "Syria", "Türkiye": "Turkey",
    "Iran": "Iran", "Egypt": "Egypt", "West Bank and Gaza Strip": "Palestine", "South Sudan": "S. Sudan",
    "Central African Republic": "Central African Rep.", "Côte d'Ivoire": "Côte d'Ivoire", "Bolivia": "Bolivia",
    "Republic of North Macedonia": "Macedonia", "Kyrgyz Republic": "Kyrgyzstan", "Republic of Moldova": "Moldova",
}
def resolve(r):
    """recipient dict (IATI iso2-form or CRS name-form) → (atlas_name, iso3)."""
    if r.get("iso2"):
        iso3, name = ISO.get(r["iso2"], (r["iso2"], r["iso2"]))
        return name, iso3
    nm = CRS_ALIAS.get(r.get("name", ""), r.get("name", ""))
    return nm, NAME2ISO3.get(nm)

def main():
    acts = json.load(open(SRC))["activities"]
    by_recipient = collections.defaultdict(lambda: {"usd": 0.0, "activities": 0})
    by_donor = collections.defaultdict(lambda: {"usd": 0.0, "activities": 0})
    by_cat = collections.defaultdict(float)
    by_year = collections.defaultdict(float)
    flows = collections.defaultdict(float)
    out_acts = []

    for a in acts:
        usd = round(a["amount_usd"]) if a.get("amount_usd") is not None else round((a.get("amount_eur") or 0) * EUR_USD)
        donor = a["donor"] or "Unknown"
        recs = a.get("recipients") or []
        # split USD across recipient countries by pct (equal if pct missing)
        alloc = []
        if recs:
            tot_pct = sum((r.get("pct") or 0) for r in recs)
            for r in recs:
                name, iso3 = resolve(r)
                share = (r.get("pct") / tot_pct) if (tot_pct and r.get("pct")) else (1 / len(recs))
                alloc.append((name, iso3, usd * share))
        else:
            alloc.append((GLOBAL, None, usd))

        by_donor[donor]["usd"] += usd; by_donor[donor]["activities"] += 1
        by_cat[a.get("ai_category", "other")] += usd
        if a.get("year"): by_year[a["year"]] += usd
        for name, iso3, amt in alloc:
            by_recipient[name]["usd"] += amt; by_recipient[name]["activities"] += 1
            by_recipient[name]["iso3"] = iso3
            flows[(donor, name)] += amt

        out_acts.append({"id": a["id"], "title": a["title"], "donor": donor,
                         "recipient": alloc[0][0] if len(alloc) == 1 else f"{len(alloc)} countries",
                         "sector": a.get("sector"), "ai_category": a.get("ai_category"),
                         "usd": usd, "year": a.get("year"), "source": a["source"], "url": a.get("url")})

    recips = sorted(({"name": k, "iso3": v.get("iso3"), "usd": round(v["usd"]), "activities": v["activities"]}
                     for k, v in by_recipient.items()), key=lambda x: -x["usd"])
    donors = sorted(({"donor": k, "usd": round(v["usd"]), "activities": v["activities"]}
                     for k, v in by_donor.items()), key=lambda x: -x["usd"])
    # top flows for the Sankey (cap to keep it readable)
    flow_list = sorted(({"donor": d, "recipient": r, "usd": round(u)} for (d, r), u in flows.items()),
                       key=lambda x: -x["usd"])[:40]
    years = [{"year": y, "usd": round(by_year[y])} for y in sorted(by_year)]
    sectors = sorted(({"code": k, "usd": round(v)} for k, v in by_cat.items()), key=lambda x: -x["usd"])

    total_usd = round(sum(a["usd"] for a in out_acts))
    data = {
        "built_at": int(time.time()),
        "source_note": "IATI (via d-portal, keyless). AI-tagged by Claude. Amounts converted EUR→USD (~1.08). OECD CRS to follow.",
        "totals": {"usd": total_usd, "activities": len(out_acts), "donors": len(donors),
                   "recipients": len([r for r in recips if r["name"] != GLOBAL]),
                   "year_min": years[0]["year"] if years else None, "year_max": years[-1]["year"] if years else None},
        "by_recipient": recips, "by_donor": donors, "by_sector": sectors, "by_year": years,
        "flows": flow_list, "activities": sorted(out_acts, key=lambda x: -x["usd"]),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, "w"), indent=1)
    print(f"wrote funding.json · total ${total_usd:,} · {len(out_acts)} activities · {len(donors)} donors · {len(recips)} recipients")

if __name__ == "__main__":
    main()
