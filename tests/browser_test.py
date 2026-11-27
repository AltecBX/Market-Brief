"""Browser tests with real data and simulated failures. Needs Playwright and Chrome, and a local server:
    python3 -m http.server 8766   (from the repo root, in another shell)
    python3 tests/browser_test.py
Checks: no page errors in every scenario; iPhone 16 Pro Max layout (440 x 956) without sideways scrolling; the Briefing answers
its questions; perp API failure; stale data (clock moved 3 days ahead); a brief with blocks missing; Thanksgiving; the Friday
1pm early close; going offline; a refused data key."""
import json, sys
from playwright.sync_api import sync_playwright

import os
URL = os.environ.get("URL", "http://localhost:8766/index.html")
fails, n = 0, 0
def ok(c, msg):
    global fails, n
    n += 1
    if not c: fails += 1
    print(("ok   " if c else "FAIL ") + msg)

def clock(iso):
    # moves Date.now() and new Date() to the given instant, keeping the clock running
    return """(() => { const T = Date.parse('%s'), R = Date.now(), O = T - R, _D = Date;
      class D extends _D { constructor(...a) { if (a.length === 0) super(_D.now() + O); else super(...a) } static now() { return _D.now() + O } }
      D.UTC = _D.UTC; D.parse = _D.parse; globalThis.Date = D })();""" % iso

def page(b, w=440, h=956, init=None, route=None, mobile=True):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=3 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    if init: pg.add_init_script(init)
    if route:
        for pat, fn in route: pg.route(pat, fn)
    return ctx, pg, errs

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/usr/bin/google-chrome")

    # 1. normal load at iPhone 16 Pro Max size
    ctx, pg, errs = page(b); pg.goto(URL); pg.wait_for_timeout(9000)
    ok(not errs, "normal load has no page errors " + str(errs[:2]))
    ok(pg.evaluate("document.documentElement.scrollWidth") <= 440, "no sideways scrolling at 440 wide")
    txt = pg.inner_text("#dec") if pg.is_visible("#secDec") else ""
    for q in ("What happened", "What caused it", "Since the previous briefing", "Expected vs actual", "Stocks and sectors affected", "Already priced in", "Next catalysts", "What would invalidate the outlook", "Research signals", "Realistic downside"):
        ok(q in txt or ('Not in this update' in txt and q.lower() in txt.lower()), "Briefing answers or names as missing: " + q)
    vis = pg.evaluate("[].filter.call(document.querySelectorAll('#p-brief .sec'), s => s.offsetHeight > 0).length")
    hgt = pg.evaluate("document.querySelector('#p-brief') ? document.querySelector('#p-brief').scrollHeight : document.body.scrollHeight")
    print("     2 minute view: %d visible sections, %d px tall (%.1f screens)" % (vis, hgt, hgt / 956))
    ok(hgt / 956 <= 6.5, "2 minute view is at most about 6 screens on the phone")
    pg.click("#tabs [data-p=hist]"); pg.wait_for_timeout(8000)
    ok(not errs, "History tab has no page errors " + str(errs[:2]))
    closed = pg.evaluate("document.querySelectorAll('#p-hist .sec.fold.closed').length"); ok(closed >= 6, "research sections start folded (%d folded)" % closed)
    ok(pg.is_visible("#rintra") and "Loading" not in pg.inner_text("#rintra"), "intraday panel rendered")
    ctx.close()

    # 2. perp API down
    ctx, pg, errs = page(b, init="window.WebSocket = class { constructor() { setTimeout(() => { this.onerror && this.onerror({}); this.onclose && this.onclose({}) }, 50) } send() {} close() {} }", route=[("**/api.hyperliquid.xyz/**", lambda r: r.abort())]); pg.goto(URL); pg.wait_for_timeout(8000)
    ok(not errs, "perp API failure: no page errors " + str(errs[:2]))
    ok(pg.is_visible("#secDec") and "Live prices unavailable" in pg.inner_text("#dec"), "perp API failure: Briefing still shows, says live prices are unavailable")
    ctx.close()

    # 3. stale: clock 3 days ahead of the brief
    ctx, pg, errs = page(b, init=clock("2026-11-30T15:00:00Z")); pg.goto(URL); pg.wait_for_timeout(8000)
    ok(not errs, "stale data: no page errors " + str(errs[:2]))
    ht = pg.inner_text("#health") if pg.query_selector("#health") else ""
    ok("old" in ht.lower() or "stale" in ht.lower() or "behind" in ht.lower(), "stale data: health pills flag the old brief (" + ht[:80].replace("\n", " ") + ")")
    ctx.close()

    # 4. brief with blocks missing
    B = json.load(open("brief.json"))
    for k in ("daily", "top3", "events7", "priced", "stories", "semis", "scenarios", "forecast"): B.pop(k, None)
    B["opt"].pop("em", None); B["gaps"] = [["priced", "CME FedWatch unreachable"]]
    ctx, pg, errs = page(b, route=[("**/brief.json*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(B)))]); pg.goto(URL); pg.wait_for_timeout(8000)
    ok(not errs, "missing blocks: no page errors " + str(errs[:2]))
    t = pg.inner_text("#dec") if pg.is_visible("#secDec") else ""
    ok("Not in this update" in t, "missing blocks: the Briefing says what is not in this update")
    ctx.close()

    # 5. Thanksgiving and 6. the Friday early close
    for iso, want in (("2026-11-26T17:00:00Z", "closed"), ("2026-11-27T17:30:00Z", "open"), ("2026-11-27T18:30:00Z", "closed")):
        ctx, pg, errs = page(b, init=clock(iso)); pg.goto(URL); pg.wait_for_timeout(6000)
        st = pg.evaluate("session(Date.now()).st")
        ok(not errs and (st == "open") == (want == "open"), "session at " + iso + " is " + st + ", expected " + want + " " + str(errs[:1]))
        ctx.close()

    # 7. offline after load
    ctx, pg, errs = page(b); pg.goto(URL); pg.wait_for_timeout(6000); ctx.set_offline(True); pg.wait_for_timeout(20000)
    ok(not errs, "offline: no page errors " + str(errs[:2]))
    ok(pg.is_visible("#secDec"), "offline: the Briefing stays visible")
    ctx.close()

    # 8. refused data key
    ctx, pg, errs = page(b, init="try{localStorage.setItem('uw_key','00000000-0000-0000-0000-000000000000')}catch(e){}", route=[("**/api.unusualwhales.com/**", lambda r: r.fulfill(status=401, body="{}"))])
    pg.goto(URL); pg.wait_for_timeout(8000)
    ok(not errs, "refused key: no page errors " + str(errs[:2]))
    ok("not accepted" in pg.inner_text("#wtxt").lower(), "refused key: the wire says the token was not accepted")
    ctx.close()

    # recap tab and archive calendar
    ctx, pg, errs = page(b); pg.goto(URL); pg.wait_for_timeout(6000)
    ok(pg.inner_text("#recaptab") in ("Mon Recap", "Tue Recap", "Wed Recap", "Thu Recap", "Fri Recap"), "the Recap tab is named for the latest session: " + pg.inner_text("#recaptab"))
    pg.click("#tabs [data-p=mem]"); pg.wait_for_timeout(3000)
    pg.click('#rcal [data-rd="2026-11-25"]'); pg.wait_for_timeout(3000)
    fr = pg.frame_locator("#rframe")
    ok("Morning flush" in fr.locator("h1").inner_text() and fr.locator("#sectors .hb").count() == 11 and fr.locator("svg").count() >= 1, "the original Wednesday recap opens from the calendar with its chart and sector bars")
    ok(not errs, "recap archive: no page errors " + str(errs[:2]))
    ctx.close()

    # desktop
    ctx, pg, errs = page(b, 1440, 900, mobile=False); pg.goto(URL); pg.wait_for_timeout(7000)
    ok(not errs and pg.evaluate("document.documentElement.scrollWidth") <= 1440, "desktop: no errors, no sideways scrolling")
    ctx.close()
    b.close()

print(("%d of %d failed" % (fails, n)) if fails else "all %d passed" % n)
sys.exit(1 if fails else 0)
