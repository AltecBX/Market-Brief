"""Recap installer tests: run python3 tests/recap_test.py from the repo root. Works in a temporary copy, touches nothing here."""
import os, shutil, subprocess, sys, tempfile, json

fails = n = 0
def ok(c, msg):
    global fails, n
    n += 1
    if not c: fails += 1
    print(("ok   " if c else "FAIL ") + msg)

root = os.getcwd(); tmp = tempfile.mkdtemp()
for d in ("src", "tools", "data/hist"): shutil.copytree(os.path.join(root, d), os.path.join(tmp, d))
os.makedirs(os.path.join(tmp, "archive"))
def run(*a):
    r = subprocess.run([sys.executable, "tools/recap.py"] + list(a), cwd=tmp, capture_output=True, text=True); return r.returncode, r.stdout + r.stderr

wed = open(os.path.join(root, "src", "recap_fallback.html"), encoding="utf-8").read()
open(os.path.join(tmp, "wed.html"), "w").write(wed)
code, out = run("legacy", "wed.html", "--session", "2026-11-25", "--tags", "Tariffs", "--published", "2026-11-25T16:30:00-05:00")
ok(code == 0 and os.path.exists(os.path.join(tmp, "archive/recaps/2026/11/2026-11-25.html")), "the Wednesday recap is archived as published")
orig = open(os.path.join(tmp, "archive/recaps/2026/11/2026-11-25.html"), encoding="utf-8").read()

code, out = run("check", "wed.html", "--session", "2026-11-25")
ok(code != 0 and "missing section id options" in out and "sources" in out, "a recap without options intelligence and sources is not complete")

full = wed.replace('<h2 id="next">', '<h2 id="options">OPTIONS</h2><p>Expected move and positioning text for the session.</p><h2 id="next">').replace("</section>", "</section>", 1)
full += '<h2 id="sources">SOURCES</h2><p id="sources"><a href="https://www.cboe.com/">Cboe</a> <a href="https://www.reuters.com/">Reuters</a> <a href="https://www.cnbc.com/">CNBC</a></p>'
full = full.replace('<h2 id="sources">', '<h2>')  # one id only
open(os.path.join(tmp, "full.html"), "w").write(full)
code, out = run("check", "full.html", "--session", "2026-11-25")
ok(code == 0, "a complete, inert recap passes " + out[:200])

code, out = run("install", "full.html", "--session", "2026-11-25")
ok(code != 0 and "already archived" in out, "an archived session is never overwritten")
code, out = run("install", "full.html", "--session", "2026-11-25", "--correction", "added options section")
ok(code == 0 and os.path.exists(os.path.join(tmp, "archive/recaps/2026/11/2026-11-25-v2.html")), "a correction is saved as a new version")
ok(open(os.path.join(tmp, "archive/recaps/2026/11/2026-11-25.html"), encoding="utf-8").read() == orig, "the original archived recap is unchanged after a correction")

code, out = run("check", "full.html", "--session", "2026-11-26")
ok(code != 0 and "not an NYSE trading session" in out, "Thanksgiving cannot have a recap")
code, out = run("check", full.replace("2026-11-25", "2099-12-01"), "--session", "2099-12-01") if False else run("check", "full.html", "--session", "2099-12-01")
ok(code != 0 and "has not closed yet" in out, "a session that has not closed cannot be recapped")
json.dump({"session": "2026-11-30", "label": "Mon Recap", "file": "x"}, open(os.path.join(tmp, "recap.json"), "w"))
bad = full.replace('data-session="2026-11-25"', 'data-session="2026-11-24"'); open(os.path.join(tmp, "old.html"), "w").write(bad)
code, out = run("install", "old.html", "--session", "2026-11-24")
ok(code != 0 and "older than the published recap" in out, "an older recap never replaces a newer one")
code, out = run("check", "full.html", "--session", "2026-11-24")
ok(code != 0 and "data-session" in out, "the session in the recap must match")
evil = full.replace("<h1>", '<h1 onclick="x()">').replace("</h1>", '</h1><script>alert(1)</script>'); open(os.path.join(tmp, "evil.html"), "w").write(evil)
code, out = run("check", "evil.html", "--session", "2026-11-25")
ok(code != 0 and "script" in out and "onclick" in out, "scripts and handlers are rejected")
shutil.rmtree(tmp)
print(("%d of %d failed" % (fails, n)) if fails else "all %d passed" % n); sys.exit(1 if fails else 0)
