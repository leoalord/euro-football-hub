# Euro Football Hub ⚽

A real-time dashboard tracking the top 5 European football leagues — Premier League, Bundesliga, Serie A, La Liga, and Ligue 1.

## Features

- **Title & European Places** — title contenders highlighted with gold trophy icon and betting odds (%), no duplication with European spots
- **Relegation Battle** — teams near the drop zone with gap-to-safety tracking
- **Form Indicators** — last 5 results (W/D/L dots) for every team
- **Competition Badges** — shows which teams are still in UCL, UEL, UECL, and domestic cups (FA Cup, DFB-Pokal, Coppa Italia, Copa del Rey, Coupe de France)
- **Betting Odds** — DraftKings moneylines on upcoming matches
- **Upset Detection** — flags results that went against the pre-match favorite
- **Auto-refresh** — 5-minute cache during match hours, 30-minute off-peak; stale data is served instantly while a background refresh runs
- **League Detail Pages** — full standings table, upcoming fixtures, recent results, news

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Express 5 (Node.js)
- **Data:** ESPN public API (no auth needed) + BBC Sport RSS
- **Odds:** DraftKings (via ESPN) + Oddschecker (hardcoded title odds)

## Local Development

```bash
npm install
npm run dev
```

Opens on `http://localhost:5000`. The Express server handles both the API and the Vite dev server.

## Build

```bash
npm run build
npm start
```

Builds the React frontend and bundles the Express server into `dist/index.cjs`.

## Deployment

### Railway (Recommended — simplest)

1. Connect this repo to [Railway](https://railway.app)
2. Set start command: `npm start`
3. Set build command: `npm run build`
4. Deploy — that's it. Railway runs the full Node server.

### Render

1. Connect this repo to [Render](https://render.com)
2. Create a **Web Service**
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Deploy.

### Vercel

A `vercel.json` is included. Note that Vercel uses serverless functions, so the in-memory cache resets between cold starts. The app still works but may be slightly slower than Railway/Render since each cold start re-fetches from ESPN.

1. Connect this repo to [Vercel](https://vercel.com)
2. It should auto-detect the config from `vercel.json`
3. You may need to run `npm run build` locally first and commit the `dist/` folder, or adjust the build settings in Vercel's dashboard.

> **Recommendation:** Railway or Render are the better fit here because this is a long-running Express server with in-memory caching. Vercel's serverless model means every function invocation could be a cold start.

## Data Sources

- **Standings, matches, form, zones:** ESPN public API (`site.api.espn.com`)
- **Match odds:** DraftKings via ESPN (available for EPL, Bundesliga, Serie A, Ligue 1)
- **Title odds:** Oddschecker (hardcoded snapshot — update in `server/espn.ts` → `TITLE_ODDS`)
- **News:** ESPN + BBC Sport RSS feed
- **Competition tracking:** ESPN scoreboard API scanned daily across domestic cups and European tournaments

No API keys required. All data sources are public.

## Caching

The slow path used to be a cache miss on `/api/dashboard`: each visit could wait on hundreds of independent ESPN scoreboard calls (per-day, per-league, and the same European competitions scanned five times).

The server now:

1. **Serves stale data immediately** when the TTL expires, and refreshes ESPN/Kalshi in the background (stale-while-revalidate). Concurrent visitors share one in-flight fetch.
2. **Warms the cache on boot** and keeps it warm on a timer just under the current TTL, so the first visitor after a deploy rarely waits.
3. **Collapses ESPN fan-out** — match history is fetched in two-week ranges instead of one request per day, and cup/European remaining-team scans run once globally instead of once per league.
4. **Sends `Cache-Control: private, no-cache`** on API responses so browsers revalidate against the (now fast) server cache rather than keeping a long stale copy.
5. **Persists the last dashboard/league/cups payload in `localStorage`** so a revisit paints immediately while a background refetch runs.

TTL is still 5 minutes during typical European match hours (10:00–23:00 UTC) and 30 minutes off-peak. Prediction-market (Kalshi) payloads stay at 15–30 minutes and are not stored when a fetch returns empty, so a failed odds call can retry.

## Project Structure

```
├── client/src/          # React frontend
│   ├── pages/           # Dashboard + League Detail pages
│   ├── components/      # shadcn/ui components
│   └── hooks/           # Auto-refresh hook
├── server/              # Express backend
│   ├── espn.ts          # ESPN API layer, battle computation, odds
│   ├── routes.ts        # API endpoints
│   └── index.ts         # Server entry point
├── shared/              # Shared types (schema.ts)
└── dist/                # Build output (gitignored)
```

## Updating Title Odds

Title odds are hardcoded in `server/espn.ts` in the `TITLE_ODDS` constant. Update the percentages periodically from Oddschecker or your preferred odds source. Teams below 5% implied probability are filtered out of the title contender highlighting.

---

Built with [Perplexity Computer](https://www.perplexity.ai/computer)
