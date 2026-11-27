# Scheduled update runbook

This repo is a phone market brief: https://altecbx.github.io/Market-Brief/
`index.html` never changes in a scheduled run. Live prices (every 15s) and the live news wire (every 60s) run in the page.
A scheduled run only rewrites `brief.json` (and `recap.html` at the 4:30pm run), checks it, and pushes to `main`.

## Run times (ET, weekdays) and what each one leads with
One scheduled task, "Market Brief updates", starts at 7:02am, 9:02am, 12:02pm, 3:02pm, 4:02pm and 8:02pm ET (cron `2 7,9,12,15,16,20 * * 1-5`). The run picks its row from the current ET hour. Results are live about 15 minutes after the start. At the 4:02pm run, Unusual Whales end of day option levels may not be final yet: if they still show the prior session, keep the previous `opt` block.
| Run | Session | Lead with | anchor (board "Since" column) | base (prior cash close) |
|---|---|---|---|---|
| 7:30am | Premarket | Overnight: futures, Asia close, Europe, overnight news, today's data and earnings | Since 4pm yesterday | Last cash close |
| 9:15am | Pre open | Futures vs base, 8:30 data result, premarket movers, what to watch at the open | Since 7:30am | Last cash close |
| 12pm | Midday | What the morning did and why, leaders and laggards, levels hit | Since 9:30 open | Last cash close |
| 3pm | Afternoon | Afternoon moves, into the close setup, flows | Since 12pm | Last cash close |
| 4:30pm | Close | Close recap. Also write `recap.html` | Since 9:30 open | Today's close |
| 8pm | Evening | After hours earnings, futures open at 6pm, Asia open at 7pm | Since 4pm | Today's close |

On market holidays and half days, say so in `kicker` and adjust the calendar.

## Steps
1. Clone: `git clone --depth 1 https://github.com/AltecBX/market-brief` and work in it.
2. Gather (verify every number against a source; never from memory):
   - Index closes, futures, Asia and Europe, yields, oil, gold, VIX: web search (Reuters, AP, CNBC, Bloomberg, MarketWatch, Barchart, Cboe).
   - Live perps: `python3 tools/prices.py now`. Anchor prices: `python3 tools/prices.py anchor "<ISO time ET>"`.
   - Options (Unusual Whales tools): `get_gex_levels` SPX with source `oi` and `vol`, `get_greek_exposure_by_strike` SPX (take the 10 strikes with the largest abs(call_gex)+abs(put_gex) within about 4% of spot, as [strike, call_gex, put_gex]), `get_max_pain` SPX (nearest monthly), `get_implied_volatility_term_structure` SPY (implied_move_perc x 100 for the next daily expiry and the next Friday weekly).
   - VIX curve: VIX9D, VIX, VIX3M and the first 7 monthly VIX futures settlements (web: Cboe, vixchart, robomacro). If not found, keep the previous values and set `opt.asof` to when they are from.
   - If Unusual Whales tools are not available, keep the previous `opt` block unchanged and leave its `asof` as is.
3. News filter for `picks` (6 to 14 items, newest first, last 24h): keep only items that moved or can move a major market: Fed and economic data, tariffs and policy, oil and conflict, megacaps and chips, index level moves, big earnings. Drop stock picks, analyst price targets, law firm alerts, crypto chatter. Each item: `[time ET, CAT, dir, text]`, CAT in FUT, ASIA, AI, OIL, MACRO, FED, EARN; dir `up`, `dn` or `""` (effect on stocks).
4. Write `brief.json` (same schema as the current file):
   - `updated` ISO time, `updatedLabel` like "Fri 7:30am ET", `next` = next run time.
   - `headline`: the finding in one line. `lede`: one or two sentences. `pills`: 4 to 6 `[g|r|a|b, text]`.
   - `drivers`: exactly 4 `[g|r, TITLE IN CAPS, text]`, the 4 things driving price now.
   - `means`: 3 to 4 lines on what it means for the next session (`<b>` allowed). `calendar`: next items with times.
   - `base`: `{label, spx, closes}` with closes for xyz:SP500 (SPX), xyz:XYZ100 (NDX), and any board names you have official closes for.
   - `anchor`: `{label, prices}` from tools/prices.py anchor.
   - `ladder`: bull trigger, range floor, 4 to 6 marks `[price, short label, 0|1]` (1 = label above), and the three zone texts.
   - `chart`: title, start (last cash close time), startLabel, marker `[ISO time, label]` for the key event.
   - `opt`: asof, base (= base.spx), em `[[label, pct, expiry note], ...]` (2 rows), vix, levels, gex.
   - `sources`: `[[title, https url], ...]` for what you used.
5. 4:30pm run only: write `recap.html` as an HTML fragment (no `<script>`, no `<html>`), same structure as the "Wed recap" in index.html: hero with title and three cards, scoreboard, how the day unfolded, why it fell or rose, cross asset, sectors and movers, key questions. Set `recapLabel` like "Fri recap". Use the same class names as that recap (hero, kicker, pills, three, k, grid, idx, card, two, why, tag, strip, cell, mv, qa, q) so the page styles it. For the sector bars write `<div id="sectors" data-sectors='[["Materials",2.07],["Technology",-0.83]]'></div>`.
6. This repo and page are public. Never write personal names, accounts, positions, API tokens or other private details into any file or commit message.
7. Style: plain English, short. No hyphens or dashes in text. Use the % symbol. Numerals for times like 4:30pm. Minus sign "−" for negatives.
8. `python3 tools/check.py` must print OK. Then commit with a short message and push to `main`. Pages updates in about a minute; the open page reloads `brief.json` every 5 minutes.
9. If something fails, still push what is verified, and say what was skipped in the commit message.
