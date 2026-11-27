# Scheduled update runbook

This repo is a phone market brief: https://altecbx.github.io/Market-Brief/
`index.html` never changes in a scheduled run. Live prices (websocket, with a REST refresh every 15s) and the live news wire (every 60s) run in the page.
A scheduled run rewrites `brief.json` (and `recap.html` on the close run), archives it, checks it, and pushes to `main`.

## Run times (ET, weekdays)
One scheduled task, "Market Brief updates", starts at 7:02am, 9:02am, 12:02pm, 3:02pm, 4:02pm and 8:02pm ET (cron `2 7,9,12,15,16,20 * * 1-5`). Each run is live about 15 minutes after it starts. The run picks its row from the current ET hour.
| Starts | Name | Lead with | anchor ("Since" basis) | base (last cash close) |
|---|---|---|---|---|
| 7:02am | Morning (also called the 7:30am row) | Overnight: futures, Asia close, Europe, overnight news, today's data and earnings | 4pm yesterday | Last cash close |
| 9:02am | Pre open (9:15am row) | Futures vs base, 8:30 data result vs consensus, premarket movers, what to watch at the open | 7:00am today | Last cash close |
| 12:02pm | Midday (12pm row) | What the morning did and why, leaders and laggards, levels hit | 9:30am open | Last cash close |
| 3:02pm | Afternoon (3pm row) | Afternoon moves, setup into the close | 12:00pm | Last cash close |
| 4:02pm | Close (4:30pm row) | Close recap. Also write `recap.html` | 9:30am open | Today's close |
| 8:02pm | Evening (8pm row) | After hours earnings, futures open at 6pm, Asia open at 7pm | 4pm today | Today's close |

On market holidays and half days, say so in `kicker` and adjust the calendar. At the 4:02pm run, Unusual Whales end of day option levels may not be final: if they still show the prior session, keep the previous `opt` block and its `asof`.

## Steps
1. Clone: `git clone --depth 1 https://github.com/AltecBX/market-brief` and work in it.
2. Gather. Verify every number against a source, never from memory. Record each source in `sources`.
   - Index closes, futures, Asia and Europe, yields, oil, gold, VIX, Fed odds: web search (Reuters, AP, CNBC, Bloomberg, MarketWatch, Barchart, Cboe, CME FedWatch).
   - Cash closes for board stocks and ETFs: Unusual Whales `get_ticker_ohlc_latest_or_date` with `limit` 1 (field `close`, check `date` is the session you mean) for NVDA AMD MU SNDK WDC AVGO TSM ASML LRCX AMAT SMH ORCL AAPL MSFT GOOGL AMZN META TSLA. Index closes (SPX, NDX) from Cboe, Nasdaq or a news wire. Unusual Whales has no index or VIX prices.
   - Perps: `python3 tools/prices.py verify` (lists missing or delisted instruments), `python3 tools/prices.py now`, and `python3 tools/prices.py at "<ISO time with offset>"` for the perp price at an exact time. Times need the UTC offset: 16:00 ET is `-05:00` in winter and `-04:00` in summer.
   - Options (Unusual Whales tools): `get_gex_levels` SPX with source `oi` and `vol`; `get_greek_exposure_by_strike` SPX (the 10 strikes with the largest abs(call_gex)+abs(put_gex) within about 4% of spot, as [strike, call_gex, put_gex]); `get_max_pain` SPX (nearest monthly); `get_implied_volatility_term_structure` for SPXW (daily and weekly expiries), SPX (the standard monthly) and SPY. Use `implied_move_perc` x 100.
   - VIX: VIX9D, VIX, VIX3M index closes and the first 7 monthly VIX futures settlements (Cboe, vixcentral, barchart). If not found, keep the previous values and their `asof`.
   - If Unusual Whales tools are not available, keep the previous `opt` block unchanged and leave its `asof` as is.
3. News filter for `picks` (6 to 14 items, newest first, last 24h): only items that moved or can move a major market: Fed and economic data, tariffs and policy, oil and conflict, megacaps and chips (memory, storage, equipment, export rules, hyperscaler capex), index level moves, big earnings. Drop stock picks, analyst price targets, law firm alerts, crypto chatter. Each item: `[time ET, CAT, dir, text]`, CAT in FUT, ASIA, AI, OIL, MACRO, FED, EARN; dir `up`, `dn` or `""` (effect on stocks). Say whether news is new or already known. Never state a cause for a move unless a source states it.
4. Write `brief.json` (keep every existing key; `tools/check.py` lists what is required):
   - `updated` ISO time with offset, `updatedLabel` like "Fri 7:02am ET", `next` like "9:02am".
   - `kicker`, `headline` (the finding in one line), `lede` (one or two sentences), `pills` 4 to 6 `[g|r|a|b, text]`.
   - `top3`: exactly 3 `[title, text]`, the three most important developments right now.
   - `drivers`: exactly 4 `[g|r|a, TITLE IN CAPS, text]`.
   - `risks`: 2 to 5 `[when or level, text]`, immediate risks. `calendar`: `[time, text]` for the next items, with consensus and prior for data releases, and actual vs consensus once released.
   - `scenarios`: exactly 3 objects in this order, `n` Bullish, Neutral, Bearish, each with `cond` (what must happen, with levels), `confirm` (signals that confirm), `risk`, `inval` (level or event that invalidates). No probabilities.
   - `events7`: the next 7 trading days, `[ISO date, time, text, importance 1 to 3, tag, forecast, prior, actual]` for data releases, Fed decisions and speakers, Treasury auctions and major earnings (chips and megacaps first). Holidays, half days and option expirations are computed by the page, do not add them. Fill `actual` once released.
   - `priced`: `{asof, fed: [[meeting, text, exp|conf|spec]], data: [[release, when, forecast, prior, actual, surprise text]], earn: [[ticker, when, implied move %, note]], other: [[label, text, exp|conf|spec]]}`. `exp` is a market expectation with its source (CME FedWatch, consensus), `conf` a released result, `spec` speculation. Earnings implied moves come from Unusual Whales.
   - `qa`: 6 to 12 `[question, answer, https source]` for the questions a trader gets asked now: why the market moved, why it reversed, the Fed, yields, Korea and Japan, memory prices, the biggest risks this week, what options imply, what changed since yesterday. Two sentences each, sourced; say "not established" when no source explains a move.
   - `internals` (when found): `[label, value, source and time]` such as NYSE advancers vs decliners, new highs vs lows, % of S&P stocks above the 50 and 200 day averages.
   - `forecast`: `{dir: "up" or "down", date: ISO date of the session it is about, ref: SPX level it is measured against, regime: the page's regime label if known (for example Broad rally), basis: one line on why}`. One call per brief about the next close vs `ref`. It is scored automatically from the archive and is never edited later.
   - `stories`: 2 to 5 consequential stories, each `{t: time ET, h: short title, what, why, assets, impl: bull|bear|mixed, read, reacted, known: new|known, confirm, invalid, src: https link}`. `reacted` states the measured price move after the timestamp and whether it began before the story; never claim a move was caused by a story unless the source says so. Mark a story `known` when it repeats earlier reporting.
   - `semis`: `{asof, memory: [[item, reading, https source]], notes: [[TOPIC, text, https source]]}`. Memory: latest DRAM, NAND and HBM contract or spot price trends (TrendForce, DRAMeXchange, company commentary). Notes: supply and demand, export restrictions, AI and hyperscaler spending, earnings and guidance, estimate revisions, and Korea, Taiwan and Japan chip market news, for NVDA AMD MU SNDK WDC STX AVGO TSM ASML LRCX AMAT KLAC SMH SOXX SK Hynix Samsung Kioxia. 3 to 8 notes, newest first. Skip anything you cannot source.
   - `opt.skew` (when Unusual Whales chains are available): `{asof, rows: [[expiry label, 25 delta put IV %, ATM IV %, 25 delta call IV %], ...]}` for the next weekly and the monthly SPX expiry, from `get_chains_for_expiry`. `opt.ivchg`: `[[label, IV % now, IV % at the previous update]]` for the same expiries.
   - `opt.zero` (9:02am, 12:02pm and 3:02pm runs on expiry days): `{asof, expiry, note, rows: [[strike, call_gex, put_gex], ...]}` for today's SPX expiry from `get_greek_exposure_by_strike_expiry`, the 8 largest strikes within 2% of spot. Leave it out when there is no same day expiry or no data.
   - `means`: 3 to 4 lines on what it means next (`<b>` allowed).
   - `base`: `{label, ts, spx, closes, perp, closesSrc, prevChg}`. `ts` is the last cash close time. `closes` are real cash closes only, keyed by perp id (xyz:SP500 = SPX, xyz:XYZ100 = NDX, xyz:NVDA = NVDA). `perp` is `prices` from `tools/prices.py at "<base.ts>"`. `prevChg` is the S&P % change of the session before `base` (number).
   - `anchor`: `{label, ts, prices}` with `prices` from `tools/prices.py at "<anchor.ts>"`.
   - `ladder`: bull trigger, range floor, 4 to 6 marks `[price, short label, 0|1]` (1 = label above), and `bullText`, `rangeText`, `riskText`.
   - `chart`: title, start (= base.ts), startLabel, marker `[ISO time, label]` for the key event.
   - `opt`: `asof`, `base` (the SPX close the options data is from), `em` rows `[label, pct, expiry note, "SPXW" or "SPX", ISO expiry date]` nearest first (next daily, next Friday weekly, standard monthly), `emSpy` rows `[label, pct, expiry note]`, `spyBase` (SPY close), `emSrc`, `vix {asof, idx: [["9D",9,x],["VIX",30,x],["3M",91,x]], fut: [[month, days, settle], ...]}`, `levels` `[name, price, r|g|a|b]`, `gex`.
   - `sources`: `[[title, https url], ...]` for what you used.
5. Close run only, history for the probability engine: run `python3 tools/history.py cboe` (Cboe and FRED). Then call Unusual Whales `get_ticker_ohlc_latest_or_date` with `limit` 5 for SPY, QQQ, NVDA, MU, SNDK, RSP, SMH and IWM, save each result as JSON and run `python3 tools/history.py uw <files>`. The tool only adds or confirms rows; if it reports conflicting rows, leave them and say so in the commit message. If a download fails, skip it; the page keeps working with the older history.
6. Close run only: write `recap.html` as an HTML fragment (no `<script>`, `<style>`, handlers or non https links), same structure and class names as the recap built into the page (hero, kicker, pills, three, k, grid, idx, card, two, why, tag, strip, cell, mv, qa, q). Sector bars: `<div id="sectors" data-sectors='[["Materials",2.07],["Technology",-0.83]]'></div>`. Set `recapLabel` like "Fri recap".
7. This repo and page are public. Never write personal names, accounts, positions, API tokens or other private details into any file or commit message.
8. Style: plain English, short. No hyphens or dashes in text. Use the % symbol. Numerals for times like 4:30pm. Minus sign "−" for negatives.
9. `python3 tools/check.py` must print OK. Then `python3 tools/archive.py` (new files under `archive/` are part of every run, alongside brief.json and recap.html) (add `--recap` on the close run), then `python3 tools/check.py` again. Never edit or delete anything already in `archive/`.
10. Commit with a short message and push to `main` with `git -c push.negotiate=true push origin main`. Pages updates in about a minute; an open page reloads `brief.json` every 5 minutes.
11. If a source fails, keep the last verified values for that part, leave its `asof` showing when it is from, push what is verified, and say what was skipped in the commit message. If `check.py` cannot pass, push nothing.
