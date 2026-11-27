# Market Brief

Phone market brief. Open it any time to see where markets trade, what changed since you last looked, what is driving it, and what to watch next.

**Link:** https://altecbx.github.io/Market-Brief/
On iPhone: open the link in Safari, tap Share, then Add to Home Screen. It opens full screen like an app, follows light and dark mode (or tap the half circle button for Auto, Light or Dark), and refreshes each time you open it.

## Tabs
| Tab | What it shows |
|---|---|
| Brief | Market session, regime with its evidence, what changed since your last visit, the 3 things that matter most, key readings, drivers, risks and catalysts, scenarios, and the distance to every key level. Reading modes: 30 seconds, 2 minutes (default) and Deep |
| Board | Overnight chart, breadth across 59 stock perps, and the live board (semis, indexes, megacaps, commodities and FX, crypto). Pick one comparison basis at a time. Tap a row for mark, oracle, funding, open interest, volume and spread |
| Options | SPX expected moves from SPX and SPXW options (SPY shown separately), how much of each move is used, a price scenario simulator, big option positions, and the VIX index and futures curves |
| History | Probability engine: pick a market condition (big S&P drop, losing streak, VIX level, VIX spike and reversal, intraday recovery, gaps, big chip stock drops, breadth divergence), set thresholds and years, and see how markets did next, with sample size, 95% ranges, a baseline of all days, a stability check and every comparable date. The Brief shows matches for today's conditions automatically |
| News | Live wire filtered to market moving headlines, with the perp reaction 5, 15, 30 and 60 minutes after each one, the move before it, and the move vs the S&P. Plus Claude's picks |
| Recap | The day's close recap |
| Memory | Every scheduled brief and recap as published. Never edited afterward |

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
| `src/page.html`, `src/app.js`, `src/recap_fallback.html` | Page layout, page code, built in recap | Design changes |
| `brief.json` | All scheduled content | The scheduled task, each run |
| `recap.html` | The day's recap tab | The scheduled task, after the close |
| `archive/` | Every brief and recap as published, plus `index.json` | The scheduled task adds files; nothing is ever edited |
| `UPDATE.md` | Step by step instructions every scheduled run follows | When the update rules change |
| `tools/check.py` | Validates brief.json, recap.html and the archive before any push | When the schema changes |
| `tools/prices.py` | Perp prices now, at an exact time, and instrument checks | Rarely |
| `data/hist/` | Daily history: S&P since 1975, VIX family since 1990, Nasdaq 100, Nikkei, 10 year yield, and about 2 years of SPY, QQQ, NVDA, MU, SNDK, RSP, SMH, IWM bars | The close run adds new days |
| `tools/history.py` | Refreshes `data/hist/` | Rarely |
| `tools/archive.py` | Copies the brief into the archive | Rarely |
| `manifest.json`, `icon-*.png` | Home Screen app name and icon | Rarely |

If `brief.json` is missing or broken, the page falls back to the brief built into `index.html`, labeled with its own time.
