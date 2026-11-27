"""Validate brief.json before pushing. Run: python3 tools/check.py"""
import json, re, sys
B = json.load(open("brief.json"))
need = ["updated","updatedLabel","next","kicker","headline","lede","pills","drivers","picks","planTitle","means",
        "calTitle","calendar","impNote","base","anchor","ladder","chart","opt","recapLabel"]
err = [k for k in need if k not in B]
def texts(o):
    if isinstance(o, str): yield o
    elif isinstance(o, list):
        for x in o: yield from texts(x)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k in ("updated","start","marker","sources"): continue
            yield from texts(v)
for s in texts(B):
    if re.search(r"[—–]", s) or re.search(r"\w-\w", s): err.append("dash in text: " + s[:70])
    if re.search(r"\bpercent\b", s, re.I): err.append("use % : " + s[:70])
b = B.get("base", {})
if not isinstance(b.get("spx"), (int, float)): err.append("base.spx missing")
if "xyz:SP500" not in b.get("closes", {}): err.append("base.closes needs xyz:SP500")
o = B.get("opt", {})
for k in ("asof","base","em","vix","levels","gex"):
    if k not in o: err.append("opt." + k + " missing")
if len(B.get("drivers", [])) != 4: err.append("drivers must be 4")
if not 6 <= len(B.get("picks", [])) <= 14: err.append("picks should be 6 to 14")
for p in B.get("picks", []):
    if len(p) != 4 or p[1] not in ("FUT","ASIA","AI","OIL","MACRO","FED","EARN") or p[2] not in ("up","dn",""): err.append("bad pick: " + str(p)[:70])
print("OK" if not err else "\n".join(err)); sys.exit(1 if err else 0)
