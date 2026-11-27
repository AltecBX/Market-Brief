"""Developer build: assemble index.html from src/page.html, src/app.js, brief.json and src/recap_fallback.html.
Scheduled runs never call this. Run: python3 tools/build.py"""
import json
page = open("src/page.html", encoding="utf-8").read()
js = open("src/app.js", encoding="utf-8").read() + "\n" + open("src/history.js", encoding="utf-8").read() + "\n" + open("src/extra.js", encoding="utf-8").read() + "\n" + open("src/start.js", encoding="utf-8").read()
brief = json.dumps(json.load(open("brief.json")), ensure_ascii=False, separators=(",", ":"))
recap = open("src/recap_fallback.html", encoding="utf-8").read()
assert "</script" not in brief.lower() and "</script" not in js.replace("</script>\n</body>", "").lower()
js = js.replace("/*START*/", "")
out = page.replace("{{RECAP}}", recap).replace("{{JS}}", js.replace("{{BRIEF}}", brief))
open("index.html", "w", encoding="utf-8").write(out)
print("index.html", len(out))
