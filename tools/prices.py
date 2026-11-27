"""Hyperliquid helper for the scheduled update.
Usage:
  python3 tools/prices.py anchor "2026-11-27T09:30:00-05:00"   -> anchor prices (1h candle open at that time) as JSON
  python3 tools/prices.py now                                   -> current mark prices for the board coins
"""
import json, sys, urllib.request
from datetime import datetime
API = "https://api.hyperliquid.xyz/info"
COINS = ["xyz:SP500","xyz:XYZ100","xyz:NVDA","xyz:MU","xyz:SKHX","xyz:SMH","xyz:GOLD","xyz:BRENTOIL","xyz:CL",
         "xyz:JP225","xyz:KR200","xyz:AMD","xyz:ORCL","xyz:TSM","BTC"]
def post(body):
    req = urllib.request.Request(API, json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=20))
def anchor(ts):
    t = int(datetime.fromisoformat(ts).timestamp() * 1000)
    out = {}
    for c in COINS:
        k = post({"type": "candleSnapshot", "req": {"coin": c, "interval": "5m", "startTime": t, "endTime": t + 15 * 60000}})
        if k: out[c] = float(k[0]["o"])
    return out
def now():
    out = {}
    for dex in ("xyz", None):
        body = {"type": "metaAndAssetCtxs"}
        if dex: body["dex"] = dex
        m = post(body)
        for u, c in zip(m[0]["universe"], m[1]):
            if c and c.get("markPx"): out[u["name"]] = [float(c["markPx"]), float(c["prevDayPx"])]
    return out
if __name__ == "__main__":
    print(json.dumps(anchor(sys.argv[2]) if sys.argv[1] == "anchor" else now()))
