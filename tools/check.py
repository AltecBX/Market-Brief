"""Validate brief.json, recap.html and the archive before pushing. Run: python3 tools/check.py
Exit code 0 and "OK" means it is safe to push."""
import json, os, re, subprocess, sys
from datetime import datetime, timezone, timedelta

err, warn = [], []
try:
    B = json.load(open("brief.json"))
except Exception as e:
    print("brief.json is not valid JSON: " + str(e)); sys.exit(1)

def num(x): return isinstance(x, (int, float)) and not isinstance(x, bool)
def iso(s, name):
    try:
        d = datetime.fromisoformat(str(s))
        if d.tzinfo is None: err.append(name + " needs a UTC offset"); return None
        return d
    except Exception:
        err.append(name + " is not an ISO time: " + str(s)[:40]); return None

# required keys
need = ["updated","updatedLabel","next","kicker","headline","lede","pills","drivers","picks","planTitle","means",
        "calTitle","calendar","impNote","base","anchor","ladder","chart","opt","recapLabel","sources"]
err += ["missing key: " + k for k in need if k not in B]
# From the 9:02am run on Nov 27 2026 every structured block must be present. A block may be empty only when "gaps" says why
# ([[block, reason]]), so the page can say "not in this update" instead of showing an empty component.
CUT = "2026-11-27T09:00:00-05:00"
try:
    from datetime import datetime as _dt
    newer = _dt.fromisoformat(str(B.get("updated"))) >= _dt.fromisoformat(CUT)
except Exception:
    newer = False
GAPS = {g[0]: g[1] for g in B.get("gaps", []) if isinstance(g, list) and len(g) == 2 and str(g[1]).strip()}
if newer:
    for k in ("daily", "top3", "risks", "scenarios", "events7", "priced", "stories", "semis", "forecast", "qa"):
        v = B.get(k)
        if (v is None or v == [] or v == {}) and k not in GAPS: err.append("missing or empty " + k + " (add it, or list it in gaps with the reason)")
DY = B.get("daily")
if DY is not None:
    for k in ("happened", "cause", "since", "priced", "invalid"):
        if not str(DY.get(k, "")).strip(): err.append("daily." + k + " is required (say \"not established\" when no source explains it)")
    if DY.get("causeSrc") and not str(DY["causeSrc"]).startswith("https://"): err.append("daily.causeSrc must be an https link or empty")
    for r in DY.get("expected", []):
        if len(r) != 4 or not str(r[3]).startswith("https://"): err.append("daily.expected rows need [item, expected, actual, https source]")
    for r in DY.get("affected", []):
        if len(r) != 3 or r[1] not in ("up", "down", "mixed"): err.append("daily.affected rows need [name, up|down|mixed, why]")
    if not 1 <= len(DY.get("catalysts", [])) <= 5: err.append("daily.catalysts needs 1 to 5 [when, what, why]")
    for r in DY.get("catalysts", []):
        if len(r) != 3: err.append("daily.catalysts rows need [when, what, why]")
    if newer and not DY.get("asofTs"): err.append("daily.asofTs is required")

# style rules on visible text
SKIP = {"updated","start","marker","sources","ts","closesSrc","emSrc"}
def texts(o, key=""):
    if isinstance(o, str):
        if key not in SKIP: yield o
    elif isinstance(o, list):
        for x in o: yield from texts(x, key)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k in SKIP: continue
            yield from texts(v, k)
for s in texts(B):
    if re.search(r"[—–]", s) or re.search(r"[A-Za-z]-[A-Za-z]", s): err.append("dash in text: " + s[:70])
    if re.search(r"\bpercent\b", s, re.I): err.append("use the % symbol: " + s[:70])
    if re.search(r"<(?!/?b>)", s): err.append("only <b> tags allowed in text: " + s[:70])

# privacy: no tokens or personal details in a public repo
blob = json.dumps(B)
if re.search(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", blob, re.I): err.append("looks like an API token in brief.json")
if re.search(r"bearer\s+[a-z0-9]", blob, re.I): err.append("bearer token text in brief.json")

# times
now = datetime.now(timezone.utc)
up = iso(B.get("updated"), "updated")
if up and up > now + timedelta(minutes=10): err.append("updated is in the future")
b = B.get("base", {})
bt = iso(b.get("ts"), "base.ts") if "ts" in b else None
if "ts" not in b: err.append("base.ts (time of the last cash close) missing")
if bt and up and bt > up: err.append("base.ts is after updated")
a = B.get("anchor", {})
if "ts" in a:
    at = iso(a["ts"], "anchor.ts")
    if at and up and at > up: err.append("anchor.ts is after updated")
else: err.append("anchor.ts missing")

# instrument ids and prices
ID = re.compile(r"^(xyz:[A-Z0-9]+|[A-Z0-9]{2,10})$")
def prices(d, name, need_sp=True):
    if not isinstance(d, dict) or not d: err.append(name + " missing or empty"); return
    for k, v in d.items():
        if not ID.match(k): err.append(name + " bad instrument id: " + k)
        if not num(v) or v <= 0: err.append(name + " bad price for " + k)
    if need_sp and "xyz:SP500" not in d: err.append(name + " needs xyz:SP500")
if not num(b.get("spx")) or not 1000 < b["spx"] < 20000: err.append("base.spx missing or out of range")
prices(b.get("closes"), "base.closes")
prices(b.get("perp"), "base.perp")
prices(a.get("prices"), "anchor.prices")
if num(b.get("spx")) and isinstance(b.get("closes"), dict) and b["closes"].get("xyz:SP500") != b["spx"]:
    err.append("base.spx and base.closes xyz:SP500 differ")
# perps should be close to their cash close at the same moment
for k, c in (b.get("closes") or {}).items():
    p = (b.get("perp") or {}).get(k)
    if num(p) and num(c) and abs(p / c - 1) > 0.03: warn.append("perp at close differs from cash close by over 3% for " + k)

# options block
o = B.get("opt", {})
for k in ("asof","base","em","vix","levels","gex"):
    if k not in o: err.append("opt." + k + " missing")
if num(o.get("base")) and num(b.get("spx")) and abs(o["base"] - b["spx"]) > 0.01: warn.append("opt.base differs from base.spx (fine only if the options data is from an older close)")
for e in o.get("em", []):
    if len(e) not in (4, 5) or not num(e[1]) or not 0 < e[1] < 15 or e[3] not in ("SPX","SPXW"): err.append("opt.em rows must be [label, pct 0 to 15, expiry, SPX or SPXW, ISO expiry]: " + str(e)[:60])
for e in o.get("emSpy", []):
    if len(e) != 3 or not num(e[1]) or not 0 < e[1] < 15: err.append("bad opt.emSpy row: " + str(e)[:60])
if o.get("emSpy") and not num(o.get("spyBase")): err.append("opt.spyBase needed with opt.emSpy")
ems = [e[1] for e in o.get("em", []) if len(e) > 1 and num(e[1])]
if ems != sorted(ems): warn.append("opt.em should be ordered from nearest to farthest expiry")
ob = o.get("base") if num(o.get("base")) else b.get("spx")
for l in o.get("levels", []):
    if len(l) != 3 or not num(l[1]) or (num(ob) and abs(l[1] / ob - 1) > 0.15): err.append("bad or far level: " + str(l)[:60])
for g in o.get("gex", []):
    if len(g) != 3 or not all(num(x) for x in g) or g[1] < 0 or g[2] > 0: err.append("gex rows must be [strike, call_gex >= 0, put_gex <= 0]: " + str(g)[:60])
for blk, val in (("opt.asofTs", o.get("asofTs")), ("opt.vix.asofTs", (o.get("vix") or {}).get("asofTs"))):
    if val is None: err.append(blk + " missing: the time the options or VIX data is from")
    else:
        d0 = iso(val, blk)
        if d0 and up and d0 > up: err.append(blk + " is after updated")
for blk in ("semis", "priced"):
    if B.get(blk) is not None and "asofTs" not in B[blk]: err.append(blk + ".asofTs missing")
for r in B.get("internals", []):
    if len(r) < 4: err.append("internals rows need [label, value, source, asofTs]")
v = o.get("vix", {})
for row in v.get("idx", []) + v.get("fut", []):
    if len(row) != 3 or not num(row[1]) or not num(row[2]) or not 5 < row[2] < 150: err.append("bad VIX row: " + str(row)[:60])
idx = [r[0] for r in v.get("idx", [])]
if idx and idx != ["9D","VIX","3M"]: err.append("opt.vix.idx must be 9D, VIX, 3M in that order")

# ladder
L = B.get("ladder", {})
for k in ("bull","floor","marks","bullText","rangeText","riskText"):
    if k not in L: err.append("ladder." + k + " missing")
if num(L.get("bull")) and num(L.get("floor")) and L["floor"] >= L["bull"]: err.append("ladder.floor must be below ladder.bull")

# lists
if len(B.get("drivers", [])) != 4: err.append("drivers must be 4")
if not 6 <= len(B.get("picks", [])) <= 14: err.append("picks should be 6 to 14")
for p in B.get("picks", []):
    if len(p) != 4 or p[1] not in ("FUT","ASIA","AI","OIL","MACRO","FED","EARN") or p[2] not in ("up","dn",""): err.append("bad pick: " + str(p)[:70])
for t in B.get("top3", []):
    if len(t) != 2: err.append("top3 rows must be [title, text]")
if "top3" in B and len(B["top3"]) != 3: err.append("top3 must have 3 rows")
for s in B.get("scenarios", []):
    if not all(k in s for k in ("n","cond","confirm","risk","inval")): err.append("scenario rows need n, cond, confirm, risk, inval")
if "scenarios" in B and [s.get("n") for s in B["scenarios"]] != ["Bullish","Neutral","Bearish"]: err.append("scenarios must be Bullish, Neutral, Bearish")
for e in B.get("events7", []):
    if len(e) < 4 or not re.match(r"^\d{4}-\d{2}-\d{2}$", str(e[0])) or e[3] not in (1, 2, 3): err.append("events7 rows need [ISO date, time, text, importance 1 to 3, ...]: " + str(e)[:60])
P = B.get("priced")
if P is not None:
    for k in ("fed", "other"):
        for r in P.get(k, []):
            if len(r) != 3 or r[2] not in ("exp", "conf", "spec"): err.append("priced." + k + " rows need [label, text, exp|conf|spec]")
    for r in P.get("earn", []):
        if len(r) < 3 or not num(r[2]) or not 0 < r[2] < 60: err.append("priced.earn rows need [ticker, when, implied move %]")
for q in B.get("qa", []):
    if len(q) != 3 or not str(q[2]).startswith("https://"): err.append("qa rows need [question, answer, https source]")
F = B.get("forecast")
if F is not None:
    if F.get("dir") not in ("up", "down") or not re.match(r"^\d{4}-\d{2}-\d{2}$", str(F.get("date", ""))) or not num(F.get("ref")): err.append("forecast needs dir up|down, ISO date and a numeric ref")
for e in o.get("em", []):
    if len(e) >= 5 and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(e[4])): err.append("opt.em expiry date must be YYYY-MM-DD: " + str(e[4]))
for s in B.get("stories", []):
    if "material" in s and not isinstance(s["material"], bool): err.append("stories.material must be true or false")
    if not all(k in s for k in ("t","h","what","why","assets","impl","reacted","known","confirm","invalid","src")) or s.get("impl") not in ("bull","bear","mixed") or s.get("known") not in ("new","known") or not str(s.get("src","")).startswith("https://"): err.append("stories need t, h, what, why, assets, impl bull|bear|mixed, reacted, known new|known, confirm, invalid, https src")
S2 = B.get("semis")
if S2 is not None:
    for r in S2.get("memory", []) + S2.get("notes", []):
        if len(r) != 3 or not str(r[2]).startswith("https://"): err.append("semis rows need [label, text, https source]")
    if newer:
        labs = " ".join(str(r[0]).upper() for r in S2.get("memory", []))
        for m in ("DRAM", "NAND", "HBM"):
            if m not in labs: err.append("semis.memory needs a " + m + " row (latest pricing or \"no new pricing since <date>\" with the source)")
        tops = {str(r[0]).upper() for r in S2.get("notes", [])}
        if len(tops & {"SUPPLY", "DEMAND", "CAPEX", "EXPORT", "EARNINGS", "GUIDANCE", "KOREA", "TAIWAN", "JAPAN", "HBM", "PRICING"}) < 2: err.append("semis.notes should cover at least 2 of SUPPLY, DEMAND, CAPEX, EXPORT, EARNINGS, GUIDANCE, KOREA, TAIWAN, JAPAN, HBM, PRICING")
sk = o.get("skew")
if sk is not None:
    for r in sk.get("rows", []):
        if len(r) != 4 or not all(num(x) and 1 < x < 300 for x in r[1:]): err.append("opt.skew rows need [label, put IV, ATM IV, call IV] in %")
for r in o.get("ivchg", []):
    if len(r) != 3 or not num(r[1]) or not num(r[2]): err.append("opt.ivchg rows need [label, IV now, IV before]")
z = o.get("zero")
if z is not None:
    for g in z.get("rows", []):
        if len(g) != 3 or not all(num(x) for x in g) or g[1] < 0 or g[2] > 0: err.append("opt.zero rows must be [strike, call_gex >= 0, put_gex <= 0]")
for s in B.get("sources", []):
    if len(s) != 2 or not str(s[1]).startswith("https://"): err.append("sources need https links: " + str(s)[:60])

# recap.html is shown inside the page, so it must be inert
if os.path.exists("recap.html"):
    r = open("recap.html", encoding="utf-8").read()
    if re.search(r"<\s*(script|iframe|object|embed|link|meta|form)\b", r, re.I): err.append("recap.html has a forbidden tag")
    if re.search(r"\son[a-z]+\s*=", r, re.I): err.append("recap.html has an inline event handler")
    if re.search(r"javascript:", r, re.I): err.append("recap.html has a javascript: link")

# archive: files listed must exist, and published files are never changed
if os.path.exists("archive/index.json"):
    idx = json.load(open("archive/index.json"))
    for e in idx:
        if not os.path.exists(os.path.join("archive", e.get("file", ""))): err.append("archive index points to a missing file: " + str(e.get("file")))
    try:
        base = subprocess.run(["git", "merge-base", "HEAD", "origin/main"], capture_output=True, text=True).stdout.strip()
        if base:
            d = subprocess.run(["git", "diff", "--name-status", base, "--", "archive/"], capture_output=True, text=True).stdout
            for line in d.splitlines():
                st, path = line.split("\t", 1)
                if path != "archive/index.json" and not st.startswith("A"): err.append("archived file changed or removed: " + path)
    except Exception:
        pass

# history files used by the probability engine
if os.path.isdir("data/hist"):
    for fn in sorted(os.listdir("data/hist")):
        if fn == "earnings.json": continue
        try:
            h = json.load(open(os.path.join("data/hist", fn)))
            rows = h["rows"]; nf = len(h["fields"])
            if len(rows) < 100: err.append("data/hist/" + fn + " has too few rows")
            ds = [r[0] for r in rows]
            if ds != sorted(set(ds)): err.append("data/hist/" + fn + " dates not sorted or duplicated")
            if any(len(r) != nf or any((not num(x)) or x <= 0 for x in r[1:]) for r in rows): err.append("data/hist/" + fn + " has bad rows")
            if nf == 5 and any(not (r[3] <= min(r[1], r[4]) + 1e-9 and r[2] >= max(r[1], r[4]) - 1e-9) for r in rows[-300:]): warn.append("data/hist/" + fn + " has bars where high or low do not contain open and close")
        except Exception as e:
            err.append("data/hist/" + fn + " unreadable: " + str(e)[:60])

# research outputs used by the page
for fn, keys in (("fingerprint.json", ("test", "promoted", "horizon", "risk")), ("registry.json", ("signals", "tests", "rules", "distinct")), ("intraday2.json", ("inst", "note")), ("models.json", ("inst", "feat")), ("weekly.json", ("inst", "cc", "ccNeeds")), ("frozen.json", ("models",)), ("options.json", ("snapshots", "summary")), ("ledger.json", ("runs", "distinct")), ("seasonality.json", ("conds", "slots", "days")), ("semis.json", ("tests", "days", "note"))):
    p = os.path.join("data", "research", fn)
    if os.path.exists(p):
        try:
            j = json.load(open(p))
            for k in keys:
                if k not in j: err.append("data/research/" + fn + " missing " + k)
        except Exception as e: err.append("data/research/" + fn + " unreadable")
# research: every registry signal carries the required fields; append only ledger; intraday files intact
try:
    R = json.load(open("data/research/registry.json"))
    for s in R["signals"]:
        for k in ("name", "cls", "validated", "econ"):
            if k not in s: err.append("registry signal missing " + k + ": " + s.get("name", "?"))
        if s["cls"] not in ("Validated", "Promising but unconfirmed", "Insufficient evidence", "Failed validation", "Data unavailable"): err.append("registry class unknown: " + s["cls"])
        if s["cls"] not in ("Data unavailable",) and not s.get("instrument") and "Option" not in s["name"]: err.append("registry signal without instrument: " + s["name"])
    L = json.load(open("data/research/ledger.json"))
    for r in L["runs"]:
        if not os.path.exists(os.path.join("data", "research", "ledger", r["file"])): err.append("ledger run file missing: " + r["file"])
    old = subprocess.run(["git", "show", "HEAD:data/research/ledger.json"], capture_output=True, text=True)
    if old.returncode == 0:
        try:
            o = json.loads(old.stdout)
            if "runs" in o and [x["file"] for x in o["runs"]] != [x["file"] for x in L["runs"]][:len(o["runs"])]: err.append("ledger index rewrote earlier runs")
        except ValueError: pass
    ch = subprocess.run(["git", "diff", "--name-status", "HEAD", "--", "data/research/ledger/"], capture_output=True, text=True).stdout.strip().splitlines()
    for line in ch:
        if line and not line.startswith("A"): err.append("ledger file changed or deleted: " + line)
except FileNotFoundError: pass
except Exception as e: err.append("research check failed: " + str(e))
# prospective record: prediction files are written once; registered versions are never edited or removed
ch = subprocess.run(["git", "diff", "--name-status", "HEAD", "--", "data/prospective/intraday/", "data/prospective/weekly/"], capture_output=True, text=True).stdout.strip().splitlines()
for line in ch:
    if line and not line.startswith("A"): err.append("prospective prediction file changed or deleted: " + line)
old = subprocess.run(["git", "show", "HEAD:data/prospective/versions.json"], capture_output=True, text=True)
if old.returncode == 0 and os.path.exists("data/prospective/versions.json"):
    try:
        o, n = json.loads(old.stdout)["versions"], json.load(open("data/prospective/versions.json"))["versions"]
        if n[:len(o)] != o: err.append("prospective versions.json edited or reordered earlier versions")
    except ValueError: err.append("prospective versions.json is not valid JSON")
for sym in ("SPY", "QQQ", "SMH", "NVDA", "MU", "AMD", "SNDK"):
    for res, full in (("5", 78), ("30", 13)):
        p = os.path.join("data", "intraday", sym + res + ".json")
        if not os.path.exists(p): continue
        j = json.load(open(p)); seen = set(); bad = 0
        for r in j["rows"]:
            k = (r[0], r[1])
            if k in seen: err.append(p + " duplicate bar " + str(k)); break
            seen.add(k)
            if not (930 <= r[1] < 1600) or not (r[4] <= min(r[2], r[5]) <= max(r[2], r[5]) <= r[3]): bad += 1
        if bad: err.append(p + " has " + str(bad) + " bars outside the session or with high below low")
for w in warn: print("warning: " + w)
print("OK" if not err else "\n".join(err)); sys.exit(1 if err else 0)
