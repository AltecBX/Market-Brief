"""Install and permanently archive a daily recap. Never replaces a completed recap with an incomplete or unverified one.

  python3 tools/recap.py install <draft.html> --session YYYY-MM-DD [--tags "Fed,Tariffs"] [--correction "what was fixed"]
  python3 tools/recap.py check <draft.html> --session YYYY-MM-DD      (validate only)

A draft is accepted only if:
  * the session is a completed NYSE trading session (its 4pm, or 1pm on half days, close passed at least 10 minutes ago),
  * it is not older than the recap already published,
  * it is inert (no scripts, styles, frames, forms, event handlers, or links other than https),
  * it has every section: hero (h1, kicker, pills), scoreboard (id score), how the day unfolded with a chart (id day, an svg),
    catalysts (id why), cross asset (id assets), sectors and movers (id rotation, with #sectors data-sectors of 5 or more rows),
    options intelligence (id options), key questions (id ask), what's next (id next), and sources (id sources, 3 or more https links),
  * its hero carries data-session="YYYY-MM-DD" for the same session.
On success it writes recap.html (the Recap tab), recap.json (label, session, tags), a permanent standalone copy under
archive/recaps/YYYY/MM/ (page styles and the sector chart included, so it opens exactly as published) and an entry in
archive/index.json. An existing archive file is never overwritten: a correction is saved as a new version next to it."""
import json, os, re, subprocess, sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
REQ = ["score", "day", "why", "assets", "rotation", "options", "ask", "next", "sources"]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

def core(expr):
    out = subprocess.run(["node", "-e", "const C=require('./src/core.js');console.log(JSON.stringify(" + expr + "))"], capture_output=True, text=True)
    return json.loads(out.stdout)

class Scan(HTMLParser):
    BAD = {"script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button", "textarea", "base"}
    def __init__(self):
        super().__init__(); self.err = []; self.ids = set(); self.svg = 0; self.h1 = ""; self.inh1 = False; self.links = 0; self.sources = False; self.secdata = None; self.session = None; self.kicker = False; self.pills = 0; self.in_sources = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.BAD: self.err.append("not allowed: <" + tag + ">")
        for k, v in attrs:
            v = v or ""
            if k.lower().startswith("on"): self.err.append("event handler not allowed: " + k)
            if k.lower() in ("href", "src", "xlink:href") and not (v.startswith("https://") or v.startswith("#")): self.err.append("only https links allowed: " + v[:60])
            if k.lower() == "style" and re.search(r"url\(|expression", v, re.I): self.err.append("style with url() not allowed")
        if "id" in a: self.ids.add(a["id"])
        if a.get("id") == "sources": self.in_sources = 1
        if tag == "svg": self.svg += 1
        if tag == "h1": self.inh1 = True
        if tag == "a" and a.get("href", "").startswith("https://") and self.in_sources: self.links += 1
        if a.get("id") == "sectors": self.secdata = a.get("data-sectors")
        if "data-session" in a: self.session = a["data-session"]
        cls = (a.get("class") or "").split()
        if "kicker" in cls: self.kicker = True
        if "pill" in cls: self.pills += 1
    def handle_endtag(self, tag):
        if tag == "h1": self.inh1 = False
    def handle_data(self, d):
        if self.inh1: self.h1 += d

def validate(html, session):
    err = []
    try: day = datetime.strptime(session, "%Y-%m-%d")
    except ValueError: return ["session must be YYYY-MM-DD"]
    d = int(session.replace("-", ""))
    if not core("C.isTradingDay(%d)" % d): err.append(session + " is not an NYSE trading session")
    half = core("C.isHalfDay(%d)" % d)
    close = datetime(day.year, day.month, day.day, 13 if half else 16, 10, tzinfo=ET)
    if datetime.now(timezone.utc) < close: err.append("the session has not closed yet (recaps start 10 minutes after the " + ("1pm" if half else "4pm") + " close)")
    s = Scan(); s.feed(html); err += s.err
    if len(html) < 6000: err.append("draft is too short to be a complete recap (" + str(len(html)) + " characters)")
    if not s.h1.strip(): err.append("missing hero h1")
    if not s.kicker: err.append("missing kicker")
    if s.pills < 3: err.append("hero needs 3 or more pills")
    for k in REQ:
        if k not in s.ids: err.append("missing section id " + k)
    if s.svg < 1: err.append("missing the intraday chart (svg) in the day section")
    try:
        sec = json.loads(s.secdata or "null")
        if not isinstance(sec, list) or len(sec) < 5 or not all(isinstance(r, list) and len(r) == 2 and isinstance(r[1], (int, float)) for r in sec): raise ValueError
    except ValueError:
        err.append("#sectors needs data-sectors with 5 or more [name, % change] rows")
    if s.links < 3: err.append("sources section needs 3 or more https links")
    if s.session != session: err.append("hero data-session must be " + session + " (found " + str(s.session) + ")")
    if re.search(r"—|–| - ", re.sub(r"<[^>]+>", " ", html)): err.append("no hyphens or dashes in visible text")
    return err

def auto_tags(session, extra):
    tags = [t.strip() for t in (extra or "").split(",") if t.strip()]
    d = int(session.replace("-", ""))
    def rows(sym):
        try: return json.load(open("data/hist/" + sym + ".json"))["rows"]
        except Exception: return []
    S, V = rows("SPX"), rows("VIX")
    for i, r in enumerate(S):
        if r[0] == d and i:
            ch = (r[-1] / S[i - 1][-1] - 1) * 100
            if ch <= -1.5: tags.append("Selloff")
            if ch >= 1.5: tags.append("Rally")
    for i, r in enumerate(V):
        if r[0] == d:
            if r[-1] >= 30: tags.append("VIX above 30")
            if i and r[-1] / V[i - 1][-1] - 1 >= 0.15: tags.append("VIX spike")
    if core("C.isHalfDay(%d)" % d): tags.append("Half day")
    try:
        E = json.load(open("data/hist/earnings.json"))["dates"]
        td = core("Array.from({length:30},(_,i)=>C.ymdAdd(%d,i-25)).filter(C.isTradingDay)" % d)
        nxt = lambda r0: next((x for x in td if x > r0), None)
        for tk, lst in E.items():
            for rd, tm in lst:
                r0 = int(rd.replace("-", ""))
                if (tm == "pre" and r0 == d) or (tm == "post" and nxt(r0) == d): tags.append(tk + " earnings")
    except Exception: pass
    out = []
    for t in tags:
        if t not in out: out.append(t)
    return out

def nice(session):
    d = datetime.strptime(session, "%Y-%m-%d"); return DAYS[d.weekday()] + " " + d.strftime("%b ") + str(d.day) + " " + str(d.year)

def when_label(dt):
    return dt.strftime("%b ") + str(dt.day) + " " + str(dt.year) + ", " + str((dt.hour % 12) or 12) + ":" + dt.strftime("%M") + ("am" if dt.hour < 12 else "pm") + " ET"

def standalone(fragment, meta):
    page = open("src/page.html", encoding="utf-8").read()
    css = "\n".join(re.findall(r"<style>(.*?)</style>", page, re.S))
    js = open("src/app.js", encoding="utf-8").read()
    sec = re.search(r"^function sectors\(\) \{.*$", js, re.M).group(0)
    return ("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>" + meta["label"] + " " + meta["session"] + "</title><style>" + css + "\nbody{padding:12px 14px 40px;max-width:980px;margin:0 auto}</style>"
            "<script>try{var t=(location.hash||'').slice(1);if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script></head>"
            "<body><div class=\"k\" style=\"font-size:12px;color:var(--ink2);margin-bottom:6px\">" + meta["label"] + " for " + nice(meta["session"]) + ". Published " + meta.get("publishedLabel", "") + ". Original, never edited.</div>"
            "<div class=\"recap\">" + fragment + "</div>"
            "<script>function $(i){return document.getElementById(i)}function esc(s){return String(s).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]})}"
            "function sg(v){return (v>=0?'+':'\\u2212')+Math.abs(v).toFixed(2)+'%'}" + sec + ";sectors();"
            "function tell(){try{parent.postMessage({recapHeight:document.documentElement.scrollHeight},'*')}catch(e){}}window.addEventListener('load',tell);setTimeout(tell,300)</script></body></html>")

def install(path, session, tags, correction):
    html = open(path, encoding="utf-8").read()
    err = validate(html, session)
    cur = json.load(open("recap.json")) if os.path.exists("recap.json") else None
    if cur and cur["session"] > session: err.append("older than the published recap (" + cur["session"] + "); the published one stays")
    y, m = session[:4], session[5:7]
    base = os.path.join("archive", "recaps", y, m, session)
    v, dst = 1, base + ".html"
    if os.path.exists(dst):
        if not correction: err.append("a recap for " + session + " is already archived; pass --correction \"what was fixed\" to add a corrected version (the original is kept)")
        while os.path.exists(dst): v += 1; dst = base + "-v" + str(v) + ".html"
    if err:
        print("NOT INSTALLED. The published recap is unchanged.\n  " + "\n  ".join(err)); sys.exit(1)
    d = datetime.strptime(session, "%Y-%m-%d")
    s = Scan(); s.feed(html)
    meta = {"session": session, "label": DAYS[d.weekday()] + " Recap", "headline": s.h1.strip(), "tags": auto_tags(session, tags),
            "publishedAt": datetime.now(ET).isoformat(timespec="seconds"), "publishedLabel": when_label(datetime.now(ET)), "file": dst[len("archive/"):], "version": v}
    if correction: meta["correction"] = correction
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(standalone(html, meta))
    open("recap.html", "w", encoding="utf-8").write(html)
    json.dump(meta, open("recap.json", "w"), indent=1, ensure_ascii=False)
    idxp = os.path.join("archive", "index.json"); idx = json.load(open(idxp)) if os.path.exists(idxp) else []
    idx.append({"date": session, "time": datetime.now(ET).strftime("%H%M"), "kind": "recap", "label": meta["label"] + (" (correction " + str(v) + ")" if v > 1 else ""), "headline": meta["headline"], "tags": meta["tags"], "file": meta["file"]})
    idx.sort(key=lambda e: (e["date"], e["time"], e["kind"]))
    json.dump(idx, open(idxp, "w"), indent=1, ensure_ascii=False)
    print("installed " + meta["label"] + " " + session + " -> " + dst + " tags: " + ", ".join(meta["tags"]))

def legacy(path, session, tags, published):
    """Archive a recap that was already published before this tool existed, exactly as it was shown. Inert check only."""
    html = open(path, encoding="utf-8").read(); s = Scan(); s.feed(html)
    if s.err: print("NOT ARCHIVED\n  " + "\n  ".join(s.err)); sys.exit(1)
    y, m = session[:4], session[5:7]; dst = os.path.join("archive", "recaps", y, m, session + ".html")
    if os.path.exists(dst): print("already archived, left unchanged: " + dst); return
    d = datetime.strptime(session, "%Y-%m-%d")
    meta = {"session": session, "label": DAYS[d.weekday()] + " Recap", "headline": s.h1.strip(), "tags": auto_tags(session, tags), "publishedAt": published, "publishedLabel": when_label(datetime.fromisoformat(published)) + " (in the page build of that day)", "file": dst[len("archive/"):], "version": 1, "legacy": True}
    os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, "w", encoding="utf-8").write(standalone(html, meta))
    if not os.path.exists("recap.html"): open("recap.html", "w", encoding="utf-8").write(html)
    if not os.path.exists("recap.json"): json.dump(meta, open("recap.json", "w"), indent=1, ensure_ascii=False)
    idxp = os.path.join("archive", "index.json"); idx = json.load(open(idxp)) if os.path.exists(idxp) else []
    idx.append({"date": session, "time": "1630", "kind": "recap", "label": meta["label"], "headline": meta["headline"], "tags": meta["tags"], "file": meta["file"]})
    idx.sort(key=lambda e: (e["date"], e["time"], e["kind"])); json.dump(idx, open(idxp, "w"), indent=1, ensure_ascii=False)
    print("archived " + dst + " tags: " + ", ".join(meta["tags"]))

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "legacy":
        a = sys.argv; opt = lambda k: a[a.index(k) + 1] if k in a else None
        legacy(a[2], opt("--session"), opt("--tags"), opt("--published")); sys.exit(0)
    if len(sys.argv) < 3 or sys.argv[1] not in ("install", "check"): print(__doc__); sys.exit(2)
    a = sys.argv; opt = lambda k: a[a.index(k) + 1] if k in a else None
    ses = opt("--session")
    if not ses: print("--session YYYY-MM-DD is required"); sys.exit(2)
    if a[1] == "check":
        e = validate(open(a[2], encoding="utf-8").read(), ses); print("OK" if not e else "NOT OK\n  " + "\n  ".join(e)); sys.exit(1 if e else 0)
    install(a[2], ses, opt("--tags"), opt("--correction"))
