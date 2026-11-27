# Market Brief

Phone market brief. Open it any time to see where markets are trading, what is driving them, and what to watch next.

**Link:** https://altecbx.github.io/Market-Brief/
On iPhone: open the link in Safari, tap Share, then Add to Home Screen. It opens full screen like an app, follows light and dark mode, and refreshes each time you open it.

## What updates and how often

| Part | Source | How often |
|---|---|---|
| S&P implied level, overnight chart, live board | Hyperliquid xyz perps, the same feed Liquid uses | Every 15 seconds, in the page |
| News that moves markets (live wire) | Unusual Whales news API, filtered in the page | Every 60 seconds, in the page |
| Live VIX in the top strip and on the VIX curve | Unusual Whales, uses the same token as the news wire | Every 30 seconds, in the page. Without a token it shows the last close |
| Headline, drivers, Claude's picks, game plan, calendar | Claude scheduled task | 6 times a weekday |
| Options map: SPX expected move, VIX curve, big option positions | Unusual Whales and Cboe data, via the scheduled task | 6 times a weekday |
| Day recap tab | Claude scheduled task | After the close |

## Schedule

One scheduled task in Claude, **Market Brief updates**, runs weekdays (ET):

| Starts | Ready about | Leads with |
|---|---|---|
| 7:02am | 7:15am | Overnight futures, Asia, Europe, today's data |
| 9:02am | 9:15am | Futures vs the close, 8:30 data, what to watch at the open |
| 12:02pm | 12:15pm | What the morning did and why |
| 3:02pm | 3:15pm | Afternoon moves and setup into the close |
| 4:02pm | 4:15pm | Close recap, plus the day's recap tab |
| 8:02pm | 8:15pm | After hours earnings, futures, Asia open |

An open page picks up a new update within 5 minutes. No phone notifications are sent.

## Turning on the live news wire

1. In the page, scroll to **News that moves markets** and tap **Connect news**.
2. Paste the Unusual Whales API token from unusualwhales.com/dashboard/api.
3. Tap **Save and turn on**. This also turns on the live VIX price.

The token is stored only in that browser on that device. It is never saved in this repo or in the page. The Home Screen app on iPhone keeps its own storage, so add the token there too.

## Files

| File | What it is | Who changes it |
|---|---|---|
| `index.html` | The page: layout, live prices, live news wire, charts | Only when the design changes |
| `brief.json` | All scheduled content: headline, drivers, picks, plan, levels, options data | The scheduled task, each run |
| `recap.html` | The day's recap tab (created at the first 4:02pm run) | The scheduled task, after the close |
| `manifest.json`, `icon-*.png` | Home Screen app name and icon | Rarely |
| `UPDATE.md` | Step by step instructions every scheduled run follows | When the update rules change |
| `tools/check.py` | Validates brief.json before any push | Rarely |
| `tools/prices.py` | Pulls live and anchor prices from Hyperliquid | Rarely |

If `brief.json` is missing or broken, the page falls back to the last content built into `index.html`.
