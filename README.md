# Market Brief

Phone market brief. Open it any time to see where markets trade, what changed since you last looked, what is driving it, and what to watch next.

**Link:** https://altecbx.github.io/Market-Brief/
On iPhone: open the link in Safari, tap Share, then Add to Home Screen. It opens full screen like an app, follows light and dark mode (or tap the half circle button for Auto, Light or Dark), and refreshes each time you open it.

## Tabs
| Tab | What it shows |
|---|---|
| Brief | A Decision box first answers six questions: what changed, why it matters, what is most likely next, which historical evidence supports it, what would invalidate it, and the realistic downside. It uses only signals that passed validation; failed and unconfirmed ones stay in History. 2 minute mode then shows only: what changed since your last visit, why it matters, key readings, the active scenario with the next levels, what is priced in and what invalidates it, and the next 3 events. Deep adds everything else: regime evidence, the S&P ladder, drivers, all scenarios and levels, comparable history and the game plan. Also: market session, regime, a reversal watch (how much of a big move has been retraced, when the turn began, VWAP and opening range reclaims, failed breakdowns, semis and breadth participation, classified as bounce, partial, broad, rotation or potential sustainable reversal), an Ask box that searches the brief and live wire, what changed since your last visit, comparable history, the 3 things that matter most, key readings, drivers, risks, the next 7 trading days ranked for chips and the Fed, what is priced in, scenarios, and the distance to every key level. Reading modes: 30 seconds, 2 minutes (default) and Deep. Customize pins instruments, news topics and which sections show, saved on the device |
| Board | Overnight chart, a perp sample of about 60 US stocks (not exchange breadth), a semiconductor center (US designers, memory and storage, equipment, foundry and Asia memory vs the Nasdaq, plus the Asia read and sourced chip news), internals (equal weight, small caps, semis vs Nasdaq), cross asset confirmations and divergences, and the live board (semis, indexes, megacaps, commodities and FX, crypto). Pick one comparison basis at a time. Tap a row for mark, oracle, funding, open interest, volume and spread |
| Options | SPX expected moves from SPX and SPXW options (SPY shown separately), how much of each move is used, a price scenario simulator, big option positions, skew, IV changes and 0DTE positioning when the brief has them, VIX in context (percentiles, realized vs implied volatility), and the VIX index and futures curves |
| History | Signal reliability registry (instrument, horizon, independent sessions, benchmark, out of sample result, range, calibration, regimes, economic usefulness, validation date, data date), intraday high and low for SPY, QQQ, SMH, NVDA, MU, AMD and SNDK from 9:35am (live in session, replay otherwise, with remaining upside and downside percentiles and a model comparison), this week (which day sets the weekly high and low, the chance the weekly high or low is in, revisiting the Monday open, finishing above the current price, recovering the weekly decline), covered call research (chance of finishing above a strike, after big up weeks and by VIX), recovery after big chip stock declines (survival estimates, market episodes, close vs intraday lows), option strategy research from real chains, the market fingerprint for direction and for volatility, range and drawdown, Asia to US chips, and the probability engine (statistics below): pick a market condition (big S&P drop, losing streak, VIX level, VIX spike and reversal, intraday recovery, gaps, big chip stock drops, breadth divergence, Nikkei moves and the next US session or semis), set thresholds and years, and see how markets did next, with sample size, 95% ranges, a baseline of all days, a stability check and every comparable date. The Brief shows matches for today's conditions automatically |
| News | Story impact from the brief (what, why it matters, assets, read, reaction, new or known, what confirms or invalidates). Live wire filtered to market moving headlines, with the perp reaction 5, 15, 30 and 60 minutes after each one, the move before it, and the move vs the S&P. Plus Claude's picks |
| Recap | The day's close recap |
| Memory | Forecast scorecard (implied move coverage by horizon, directional calls vs an always up baseline and by regime, which scenario zone the next close landed in, option levels crossed), compare any two briefs side by side, and every scheduled brief and recap as published. Never edited afterward |

## How the history statistics work
- Each horizon (1, 2, 3, 5, 10, 20 sessions) counts only events whose holding windows do not overlap, so no day's return is used twice. A cluster rule also thins repeated signals.
- Events and the all days benchmark use the same entry and exit rule (event close, next close, or open) over the same dates.
- Signals known only after the S&P close (the VIX closes at 4:15pm) enter at the next close. Asian sessions enter at the next US price after Tokyo closes. No exchange rate published after the signal is used.
- The last 25% of each history is held out as an untouched test period. A walk forward test picks a side for each event using only earlier events.
- p values are adjusted for every setting tried that day (Bonferroni). 95% ranges are shown everywhere, and nothing is estimated from fewer than 10 events.
- Walk forward benchmarks expand over time and only include outcomes known before each decision. Training events whose outcome windows reach the holdout are purged, and test events start one horizon after the split (embargo).
- Append only ledger: every run writes one new file under `data/research/ledger/` with each configuration, its stage (training, validation or test), the dates used, the result, and the code and data versions. Earlier files are never edited; `tools/check.py` fails if one changes. The multiple testing adjustment uses the number of distinct configurations ever tested and never resets.
- Frozen configurations (`data/research/frozen.json`): each intraday model setting is frozen when chosen, and its prospective record counts only sessions after that date. A changed setting starts a new prospective clock, and the old one is kept. Test periods that have been looked at are treated as research data for any later tuning.
- Intraday engine (`tools/intraday2.js`): per instrument models on 5 minute bars (9:35, 9:40, 9:45, 10am) and 30 minute bars (10am to 3:30pm). Features: opening gap (equal to the overnight move for cash), move from the open, previous session, range so far and position in it, distance from the high and low, VWAP distance, relative volume, opening range, VIX, daily volatility, semis relative strength, breadth (equal weight vs S&P the prior day), earnings reaction days, Monday, Friday and time of day. Compared: time of day frequency, time and price position frequency, historical conditional frequency, nearest neighbours, regularized logistic regression, gradient boosted trees and a random forest. Sessions are split in time order (60% train, 20% to choose settings, 20% scored once with refits every 10 sessions on earlier data only). Scores: Brier skill, log loss, calibration error, reliability, skill in high and low VIX sessions, and economic value; ranges resample whole sessions. A model is promoted only if it beats both benchmarks with a range above zero, is calibrated, holds in each VIX regime seen and adds economic value. None was promoted on the first run, so the page shows the historical frequency and says so.
- Cash vs perp: models are trained on cash bars. The page uses live cash 5 minute bars when the data key is saved on the device; otherwise S&P and stock perps. On 72 synchronized sessions the perp gave the same 10am to 3:30pm answers as cash for all 7 instruments (Brier difference range under 0.01, mean probability difference 1% to 3%), so the perp proxy is validated after 10am. Before 10am it is not, because perp history at 5 minute resolution is too short.
- Weekly engine (`tools/weekly.js`): about 4 years of daily bars per stock, scored on later weeks only against the day of week and the day with position benchmarks, with ranges that resample whole weeks.
- Covered calls: the chance of finishing above strikes 1% to 8% above the entry close over 10 years of weeks, after big up weeks and by VIX. Premium, delta, expiry choice and comparison with systematic covered call benchmarks need historical option quotes, which this project does not have; chains are now saved every close for SPY, QQQ, SMH, NVDA, MU, AMD and SNDK so they can be measured later.
- Recovery engine: the decline must be complete at the entry close; each stock counts once per horizon window; declines in different stocks within 7 days are one market episode and the ranges resample whole episodes; Kaplan Meier survival treats events too recent to reach a horizon as unfinished; worst points are shown from closes and, for the last 4 years, from intraday lows.
- Fingerprint for options: realized volatility, maximum upside and downside, range, 5% drawdown, expected move breach and large reversal over 20 sessions, against the expanding average and a VIX based forecast. None beat the VIX based benchmark, so it is not used.
- Options research: one position at a time per stock (no overlap), bid and ask fills, $0.65 a contract, capital in use and equity drawdown, and early assignment risk around SPY ex dividend dates. Nothing is called validated before 30 settled trades.
- Limits: intraday history is 1 year at 30 minutes and about 120 sessions at 5 minutes (the feed only reaches back 1 year and returns at most 2,500 bars a request); 1 minute bars were not added because 5 minute bars already give 9:35, 9:40 and 9:45 and 1 minute history is shorter still. Asian local cash market data is not available, only perps and the TSM ADR. Bulk historical option chains are not available. VIX is not available live.

## Where the data comes from
| Part | Source | How often |
|---|---|---|
| Live prices, chart, breadth, regime, levels | Hyperliquid perps (the feed Liquid uses), websocket stream with a REST refresh | Streaming, REST every 15 seconds |
| Live wire | Unusual Whales news API, filtered in the page | Every 60 seconds |
| Headline, top 3, drivers, risks, scenarios, picks, calendar, cash closes | Claude scheduled task, from cited sources | 6 times a weekday |
| Options map, expected moves, VIX curves | Unusual Whales and Cboe data, via the scheduled task | 6 times a weekday |
| History engine, VIX percentile | Cboe and FRED daily history, Unusual Whales daily bars | After each close |

Rules the page follows: every number shows its comparison basis and time. A price older than 45 seconds is marked stale, never shown as live. If a feed fails, the last good reading stays and is marked stale. Prices that a basis cannot supply show n/a instead of a substitute. Options exposure is an estimate from open interest, not verified dealer positions. A live VIX is not available on this page; it shows the last close.

## Schedule
One scheduled task in Claude, **Market Brief updates**, runs weekdays (ET):
| Starts | Ready about | Leads with |
|---|---|---|
| 7:02am | 7:15am | Overnight futures, Asia, Europe, today's data |
| 9:02am | 9:15am | Futures vs the close, 8:30 data, what to watch at the open |
| 12:02pm | 12:15pm | What the morning did and why |
| 3:02pm | 3:15pm | Afternoon moves and setup into the close |
| 4:02pm | 4:15pm | Close recap, plus the recap tab |
| 8:02pm | 8:15pm | After hours earnings, futures, Asia open |

An open page picks up a new update within 5 minutes. No phone notifications are sent.

## Turning on the live news wire
1. Open the **News** tab and tap **Connect news**.
2. Paste the Unusual Whales API token from unusualwhales.com/dashboard/api.
3. Tap **Save and turn on**.

The token is stored only in that browser on that device. It is never saved in this repo or in the page. The Home Screen app on iPhone keeps its own storage, so add the token there too.

## Files
| File | What it is | Who changes it |
|---|---|---|
| `index.html` | The page, built from `src/` | `python3 tools/build.py`, only when the design changes |
| `src/page.html`, `src/*.js`, `src/recap_fallback.html` | Page layout, page code (app, history engine, extras, start), built in recap | Design changes |
| `brief.json` | All scheduled content | The scheduled task, each run |
| `recap.html` | The day's recap tab | The scheduled task, after the close |
| `archive/` | Every brief and recap as published, plus `index.json` | The scheduled task adds files; nothing is ever edited |
| `UPDATE.md` | Step by step instructions every scheduled run follows | When the update rules change |
| `tools/check.py` | Validates brief.json, recap.html and the archive before any push | When the schema changes |
| `tools/prices.py` | Perp prices now, at an exact time, and instrument checks | Rarely |
| `data/hist/` | Daily history: S&P since 1975, VIX family since 1990, Nasdaq 100, Nikkei, 10 year yield, USD/JPY, about 4 years of split adjusted SPY, QQQ, NVDA, MU, AMD, SMH bars (SNDK since its 2025 listing), 2 years of RSP and IWM, 10 years of closes for the chip names, and earnings dates (`earnings.json`) | The close run adds new days |
| `tools/history.py` | Refreshes `data/hist/` | Rarely |
| `tests/core.test.js`, `tests/check_test.py` | Regression tests for statistics, history studies, reversal and exhaustion, expected moves, news reactions, forecast scoring, the fingerprint, every model family, live cash bar alignment, 5 to 30 minute aggregation, lookahead in intraday and weekly features, overlapping and censored recovery events, corporate actions, incomplete sessions and validation | Every change |
| `tools/chains.py`, `data/chains/` | Saved end of session option chains (SPY about 35 days out; QQQ, SMH, NVDA, MU, AMD, SNDK weeklies) with bid, ask, delta, IV, open interest, volume and quote time | The close run |
| `tools/research.js`, `tools/intraday2.js`, `tools/weekly.js`, `tools/ml.js`, `data/research/` | All research: fingerprint, intraday and weekly engines, model fitting, recovery, Asia to US chips, options, the registry, the append only ledger (`ledger/`) and frozen configurations | The close run |
| `data/intraday/` | 5 and 30 minute regular session bars for SPY, QQQ, SMH, NVDA, MU, AMD and SNDK (30 minute bars are also built from 5 minute downloads) | The close run |
| `tests/time.test.js` | Checks Eastern time, daylight saving changes, holidays, half days and session states. Run `node tests/time.test.js` | When the calendar changes |
| `tools/archive.py` | Copies the brief into the archive | Rarely |
| `manifest.json`, `icon-*.png` | Home Screen app name and icon | Rarely |

Before changing the page: `python3 tools/build.py`, `python3 tools/check.py`, `node tests/core.test.js`, `node tests/time.test.js` and `python3 tests/check_test.py`. The NYSE holiday list in `src/app.js` covers 2026 and 2027; add the next year each December.

If `brief.json` is missing or broken, the page falls back to the brief built into `index.html`, labeled with its own time.
