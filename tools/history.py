"""Daily history files for the probability engine, in data/hist/.
  python3 tools/history.py cboe            refresh SPX, VIX, VIX9D, VIX3M, VVIX (Cboe) and NDX, Nikkei 225, 10 year yield, USD/JPY (FRED)
  python3 tools/history.py uwclose NVDA file.json   10 year daily closes from get_ticker_close_prices 10Y -> data/hist/NVDA10.json
  python3 tools/history.py intraday files...        5 or 30 minute bars from get_ticker_candles_by_range -> data/intraday/<SYM>5.json and <SYM>30.json
  python3 tools/history.py earnings TICKER file      report dates from get_earnings_history -> data/hist/earnings.json
  python3 tools/history.py uw rows.json    merge Unusual Whales daily rows (get_ticker_ohlc_latest_or_date output) for one ticker
Existing rows are kept; a newer source row for the same date replaces it only if it differs by under 0.5% (else it is reported and skipped).
Each file: {"sym","src","fields","asof","rows"} with rows sorted by date, date as YYYYMMDD integer."""
import csv, io, json, os, sys, urllib.request
OUT = "data/hist"
def get(url):
    import subprocess, time
    for i in range(3):
        r = subprocess.run(["curl", "-sSL", "-m", "60", url], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout: return r.stdout
        time.sleep(3)
    raise SystemExit("download failed: " + url)
def load(sym):
    p = os.path.join(OUT, sym + ".json")
    return json.load(open(p)) if os.path.exists(p) else None
def save(sym, src, fields, rows):
    old = load(sym); keep = {r[0]: r for r in (old["rows"] if old else [])}; skipped = 0
    drop = old.get("drop", []) if old else []
    for r in rows:
        if any(not isinstance(x, (int, float)) or x <= 0 for x in r[1:]): continue
        o = keep.get(r[0])
        if o and abs(o[-1] / r[-1] - 1) > 0.005: skipped += 1; continue
        keep[r[0]] = r
    rr = sorted(r for r in keep.values() if not any(a <= r[0] <= b for a, b in drop))
    if len(rr) < 100: sys.exit(sym + ": too few rows, not saved")
    os.makedirs(OUT, exist_ok=True)
    out = {"sym": sym, "src": src, "fields": fields, "asof": rr[-1][0], "rows": rr}
    for k in ("breaks", "note", "drop"):
        if old and k in old: out[k] = old[k]
    json.dump(out, open(os.path.join(OUT, sym + ".json"), "w"), separators=(",", ":"))
    print(sym, len(rr), "rows, last", rr[-1][0], ("skipped " + str(skipped) + " conflicting rows") if skipped else "")
def ymd(s):
    s = s.strip()
    if "/" in s: m, d, y = s.split("/"); return int(y) * 10000 + int(m) * 100 + int(d)
    y, m, d = s[:10].split("-"); return int(y) * 10000 + int(m) * 100 + int(d)
def cboe():
    for n in ("SPX", "VIX", "VIX9D", "VIX3M", "VVIX"):
        t = get("https://cdn.cboe.com/api/global/us_indices/daily_prices/%s_History.csv" % n)
        if not t.startswith("DATE"): print(n, "not a CSV, skipped"); continue
        rd = list(csv.reader(io.StringIO(t)))[1:]
        if len(rd[0]) >= 5: save(n, "Cboe daily history", ["d", "o", "h", "l", "c"], [[ymd(r[0])] + [round(float(x), 4) for x in r[1:5]] for r in rd if len(r) >= 5 and r[4]])
        else: save(n, "Cboe daily history", ["d", "c"], [[ymd(r[0]), round(float(r[1]), 4)] for r in rd if len(r) > 1 and r[1]])
    for sid, sym in (("NASDAQ100", "NDX"), ("NIKKEI225", "N225"), ("DGS10", "US10Y"), ("DEXJPUS", "USDJPY")):
        t = get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + sid)
        rd = list(csv.reader(io.StringIO(t)))[1:]
        save(sym, "FRED " + sid, ["d", "c"], [[ymd(r[0]), float(r[1])] for r in rd if len(r) > 1 and r[1] not in ("", ".")])
def uw(path):
    raw = open(path).read().strip(); data = json.loads(raw)
    if isinstance(data, dict): data = data.get("data", data.get("result", []))
    sym = data[0]["ticker"]
    rows = []
    for r in data:
        if r.get("market_time", "regular") != "regular": continue
        try: rows.append([ymd(r["date"]), float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"])])
        except (TypeError, ValueError, KeyError): pass
    ten = load(sym + "10"); adj = 0
    if ten:
        c10 = {r[0]: r[-1] for r in ten["rows"]}
        for r in rows:
            k = c10.get(r[0])
            if k and abs(k / r[4] - 1) > 0.01: f = k / r[4]; r[1:] = [round(x * f, 4) for x in r[1:]]; adj += 1
    if adj: print(sym, adj, "rows split adjusted to the 10 year adjusted closes")
    save(sym, "Unusual Whales daily bars, split adjusted", ["d", "o", "h", "l", "c"], rows)
def uwclose(sym, path):
    raw = json.load(open(path))
    if isinstance(raw, list) and raw and "text" in raw[0]: raw = json.loads(raw[0]["text"])
    data = raw.get("data", raw) if isinstance(raw, dict) else raw
    rows = [[ymd(r["date"]), float(r["c"])] for r in data if r.get("c")]
    save(sym + "10", "Unusual Whales daily closes, split adjusted", ["d", "c"], rows)
def intraday(path):
    """Regular session bars from get_ticker_candles_by_range, 5 or 30 minute (detected from spacing) -> data/intraday/<SYM><res>.json, times in ET"""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    j = json.load(open(path)); d = j.get("data", j); out = {}; sym = d[0]["ticker"]
    for c in d:
        if c.get("market", "r") != "r": continue
        t = datetime.fromisoformat(c["start"].replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York"))
        out[(int(t.strftime("%Y%m%d")), int(t.strftime("%H%M")))] = [float(c["o"]), float(c["h"]), float(c["l"]), float(c["c"]), int(c.get("vol") or 0)]
    mins = sorted(set((k[1] // 100) * 60 + k[1] % 100 for k in out)); step = min([b - a for a, b in zip(mins, mins[1:])] or [30])
    res = "5" if step == 5 else "30"
    p = "data/intraday/" + sym + res + ".json"; os.makedirs("data/intraday", exist_ok=True)
    if os.path.exists(p):
        for r in json.load(open(p))["rows"]: out.setdefault((r[0], r[1]), r[2:])
    rows = [[k[0], k[1]] + v for k, v in sorted(out.items())]
    json.dump({"sym": sym, "src": "Unusual Whales " + res + " minute bars, regular session, ET", "fields": ["d", "hm", "o", "h", "l", "c", "v"], "asof": rows[-1][0], "rows": rows}, open(p, "w"), separators=(",", ":"))
    print(sym + res, len(rows), "bars,", len(set(r[0] for r in rows)), "days,", rows[0][0], "to", rows[-1][0])
    if res == "5":
        # a complete 30 minute bucket (six 5 minute bars) also feeds the 30 minute file, so one download serves both
        by = {}
        for r in rows: by.setdefault(r[0], []).append(r)
        agg = []
        for d, bs in by.items():
            m = {b[1]: b for b in bs}
            for h in (930, 1000, 1030, 1100, 1130, 1200, 1230, 1300, 1330, 1400, 1430, 1500, 1530):
                mins = (h // 100) * 60 + h % 100; g = [m.get(((mins + 5 * q) // 60) * 100 + (mins + 5 * q) % 60) for q in range(6)]
                if all(g): agg.append([d, h, g[0][2], max(x[3] for x in g), min(x[4] for x in g), g[5][5], sum(x[6] for x in g)])
        p30 = "data/intraday/" + sym + "30.json"; old = {}
        if os.path.exists(p30):
            for r in json.load(open(p30))["rows"]: old[(r[0], r[1])] = r
        added = 0
        for r in agg:
            if (r[0], r[1]) not in old: old[(r[0], r[1])] = r; added += 1
        rr = [old[k] for k in sorted(old)]
        json.dump({"sym": sym, "src": "Unusual Whales 30 minute bars, regular session, ET (recent days built from 5 minute bars)", "fields": ["d", "hm", "o", "h", "l", "c", "v"], "asof": rr[-1][0], "rows": rr}, open(p30, "w"), separators=(",", ":"))
        print(sym + "30", "+" + str(added), "bars from 5 minute data")
if __name__ == "__main__":
    if sys.argv[1] == "cboe": cboe()
    elif sys.argv[1] == "uwclose": uwclose(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "earnings":
        # python3 tools/history.py earnings <TICKER> <file from get_earnings_history>: adds report dates, never removes
        tk, raw = sys.argv[2], json.load(open(sys.argv[3])); raw = raw.get("data", raw) if isinstance(raw, dict) else raw
        p = os.path.join(OUT, "earnings.json"); E = json.load(open(p)); have = {d for d, _ in E["dates"].get(tk, [])}; add = 0
        for r in raw:
            d, tm = r.get("report_date"), r.get("report_time")
            if d and d >= "2015-01-01" and d not in have and tm in ("premarket", "postmarket"): E["dates"].setdefault(tk, []).append([d, "pre" if tm == "premarket" else "post"]); add += 1
        E["dates"][tk].sort(reverse=True); E["asof"] = __import__("datetime").date.today().isoformat()
        json.dump(E, open(p, "w"), separators=(",", ":")); print(tk, "earnings dates +" + str(add))
    elif sys.argv[1] == "intraday":
        for p in sys.argv[2:]: intraday(p)
    elif sys.argv[1] == "uw":
        for p in sys.argv[2:]: uw(p)
