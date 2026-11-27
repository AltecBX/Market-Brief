"""Hyperliquid helper for the scheduled update. Prices are perp mids, never cash prices.
Usage:
  python3 tools/prices.py now                      current mid, mark, oracle, provider 24h ref for every instrument
  python3 tools/prices.py at "2026-11-25T16:00:00-05:00"
                                                   perp price at that exact time (open of the 5m candle that starts then)
                                                   for the board and breadth instruments. Use it for base.perp and anchor.prices.
  python3 tools/prices.py verify                   lists board instruments that are missing or delisted at the provider
Times must include the UTC offset. 16:00 ET is -05:00 in winter (EST) and -04:00 in summer (EDT).
"""
import json, sys, time, urllib.request
from datetime import datetime, timezone

API = "https://api.hyperliquid.xyz/info"
BOARD = ["xyz:SP500","xyz:XYZ100","xyz:JP225","xyz:KR200","xyz:NVDA","xyz:AMD","xyz:MU","xyz:SNDK","xyz:WDC","xyz:STX",
         "xyz:AVGO","xyz:TSM","xyz:ASML","xyz:LRCX","xyz:AMAT","xyz:SMH","xyz:SKHX","xyz:SMSN","xyz:KIOXIA","xyz:ORCL",
         "xyz:AAPL","xyz:MSFT","xyz:GOOGL","xyz:AMZN","xyz:META","xyz:TSLA","xyz:GOLD","xyz:SILVER","xyz:BRENTOIL",
         "xyz:CL","xyz:COPPER","xyz:JPY","xyz:EUR","BTC","ETH","SOL"]
BREADTH = ["TSLA","NVDA","HOOD","INTC","PLTR","COIN","META","AAPL","MSFT","ORCL","GOOGL","AMZN","AMD","MU","SNDK","MSTR",
           "CRCL","NFLX","COST","LLY","TSM","RIVN","BABA","CRWV","GME","HIMS","DKNG","LITE","BX","MRVL","RKLB","ZM","EBAY",
           "ARM","ASML","DELL","IBM","AVGO","NOW","NBIS","WDC","NOK","BE","QCOM","AMAT","GEV","IREN","NET","CRWD","RDDT",
           "AAOI","MRNA","CVX","LRCX","UMC","GLW","TTWO","ICE","PANW","SMCI","RBLX","SNOW","STX"]
BREADTH = ["xyz:" + b for b in BREADTH]

def post(body, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(API, json.dumps(body).encode(), {"Content-Type": "application/json"})
            return json.load(urllib.request.urlopen(req, timeout=20))
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(1.5 * (i + 1))

def meta():
    """{name: (ctx, info)} for every listed, non delisted instrument."""
    out = {}
    for dex in ("xyz", None):
        body = {"type": "metaAndAssetCtxs"}
        if dex: body["dex"] = dex
        m = post(body)
        for u, c in zip(m[0]["universe"], m[1]):
            if u.get("isDelisted") or not c or not c.get("markPx"): continue
            out[u["name"]] = (c, u)
    return out

def now():
    t = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = {}
    for k, (c, u) in meta().items():
        mid = c.get("midPx") or c["markPx"]
        out[k] = {"mid": float(mid), "mark": float(c["markPx"]), "oracle": float(c.get("oraclePx") or 0),
                  "ref24h": float(c.get("prevDayPx") or 0)}
    return {"fetched": t, "prices": out}

def at(ts):
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None: sys.exit("time needs a UTC offset, for example 2026-11-25T16:00:00-05:00")
    t = int(dt.timestamp() * 1000)
    t -= t % 300000                      # align to the 5m candle that starts at or before ts
    listed = meta()
    out, missing = {}, []
    for c in dict.fromkeys(BOARD + BREADTH):
        if c not in listed: missing.append(c); continue
        k = post({"type": "candleSnapshot", "req": {"coin": c, "interval": "5m", "startTime": t, "endTime": t + 300000}})
        hit = [x for x in (k or []) if int(x["t"]) == t]
        if hit: out[c] = float(hit[0]["o"])
        else: missing.append(c)
    return {"ts": datetime.fromtimestamp(t / 1000, timezone.utc).isoformat(), "prices": out, "missing": missing}

def verify():
    listed = meta()
    return {"missing_or_delisted": [c for c in dict.fromkeys(BOARD + BREADTH) if c not in listed]}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "now"
    if cmd in ("at", "anchor"): print(json.dumps(at(sys.argv[2])))
    elif cmd == "verify": print(json.dumps(verify()))
    else: print(json.dumps(now()))
