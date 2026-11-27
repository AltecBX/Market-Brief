"""Run: python3 tests/check_test.py   Each bad brief must be rejected by tools/check.py, and the current brief accepted."""
import json, os, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = json.load(open(os.path.join(ROOT, "brief.json")))
def run(mut):
    d = tempfile.mkdtemp()
    for f in ("brief.json", "tools"): (shutil.copytree if f == "tools" else shutil.copy)(os.path.join(ROOT, f), os.path.join(d, f))
    b = json.loads(json.dumps(B)); mut(b); json.dump(b, open(os.path.join(d, "brief.json"), "w"))
    r = subprocess.run([sys.executable, "tools/check.py"], cwd=d, capture_output=True, text=True); shutil.rmtree(d); return r.returncode
cases = {
    "valid brief passes": (lambda b: None, 0),
    "SPY source in SPX moves": (lambda b: b["opt"]["em"][0].__setitem__(3, "SPY"), 1),
    "missing cash close time": (lambda b: b["base"].pop("ts"), 1),
    "SPX close mismatch": (lambda b: b["base"]["closes"].__setitem__("xyz:SP500", 7000), 1),
    "hyphen in text": (lambda b: b.__setitem__("headline", "Risk-on"), 1),
    "token in text": (lambda b: b.__setitem__("lede", "12345678-1234-1234-1234-123456789abc"), 1),
    "wrong gamma sign": (lambda b: b["opt"]["gex"][0].__setitem__(2, 5), 1),
    "future timestamp": (lambda b: b.__setitem__("updated", "2030-01-01T00:00:00-05:00"), 1),
    "missing options time": (lambda b: b["opt"].pop("asofTs"), 1),
    "bad forecast": (lambda b: b.__setitem__("forecast", {"dir": "sideways", "date": "2026-11-27", "ref": 1}), 1),
    "story without source": (lambda b: b.__setitem__("stories", [{"t": "1", "h": "x", "what": "x", "why": "x", "assets": "x", "impl": "bull", "reacted": "x", "known": "new", "confirm": "x", "invalid": "x", "src": "http://x"}]), 1),
    "semis without time": (lambda b: b.__setitem__("semis", {"notes": []}), 1),
    "level far from spot": (lambda b: b["opt"]["levels"].append(["Far", 1000, "r"]), 1),
}
fails = 0
for name, (m, want) in cases.items():
    got = run(m); ok = (got == 0) == (want == 0)
    if not ok: fails += 1
    print(("ok  " if ok else "FAIL") + " " + name)
print("all passed" if not fails else str(fails) + " failed"); sys.exit(1 if fails else 0)
