"""Save an option chain snapshot for the strategy research engine.
  python3 tools/chains.py <file> <YYYY-MM-DD session date>
<file> is the saved output of Unusual Whales get_chains_for_expiry. Keeps puts and calls with |delta| from 0.03 to 0.60 and a real two sided quote.
Writes data/chains/<TICKER>/<session>_<expiry>.json. Existing snapshots are never overwritten."""
import json, os, sys
raw = json.load(open(sys.argv[1])); day = sys.argv[2]
rows = raw.get("data", raw); px = float((raw.get("price_data") or {}).get("price") or 0)
keep = []
for r in rows:
    try: d = float(r["delta"]); b = float(r["nbbo_bid"]); a = float(r["nbbo_ask"])
    except (TypeError, ValueError, KeyError): continue
    if not 0.03 <= abs(d) <= 0.60 or b <= 0 or a < b: continue
    keep.append([r["option_type"][0].upper(), float(r["strike"]), b, a, round(d, 4), round(float(r["iv"]), 4), int(r.get("open_interest") or 0)])
if not keep or not px: sys.exit("nothing usable in this chain")
tk = rows[0]["underlying_symbol"]; exp = rows[0]["expires"]
p = os.path.join("data", "chains", tk, day + "_" + exp + ".json"); os.makedirs(os.path.dirname(p), exist_ok=True)
if os.path.exists(p): sys.exit("already saved, left unchanged: " + p)
json.dump({"ticker": tk, "session": day, "expiry": exp, "underlying": px, "fields": ["type", "strike", "bid", "ask", "delta", "iv", "oi"], "src": "Unusual Whales get_chains_for_expiry, end of session NBBO", "rows": sorted(keep)}, open(p, "w"), separators=(",", ":"))
print("saved", p, len(keep), "contracts")
