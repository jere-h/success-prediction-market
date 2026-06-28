# Chip Market

A single-page, static, no-build web app for running live-service game greenlight meetings as a lightweight prioritization market.

An admin creates a prioritization round with a labeled settlement metric and a set of content items. Named participants each spend a **100-chip budget** across the items. The app then shows:

- the **aggregate normalized popularity signal** (where the room's chips went), and
- once the round settles, a **chip-weighted P&L vs. an equal-split baseline** — with intra-round actual normalization so different metric scales cancel out — plus a **cumulative leaderboard** across rounds.

Everything runs client-side: plain vanilla JS modules over `localStorage`, with hash-routed screens. The app ships pre-populated with a clearly-labeled, dismissable **sample round** so every screen is alive on first paint.

## How it works

1. **Create a round** — name it, label the settlement metric (e.g. "Day-30 retention", "Wishlist adds"), and add content items.
2. **Participants buy in** — each named participant allocates their 100 chips across the items.
3. **See the signal** — the aggregate normalized popularity shows the room's collective prioritization.
4. **Settle** — enter each item's actual metric result. The app normalizes within the round and computes each participant's chip-weighted P&L against an equal-split baseline.
5. **Track the leaderboard** — cumulative performance accumulates across rounds.

All state lives in your browser's `localStorage`. Clearing site data resets everything (and restores the sample round).

## Run it locally

No build step, no dependencies, no server required. Just open the app:


open index.html


Or double-click `index.html` in your file browser. Any modern browser works.

> If your browser is strict about ES module loading from `file://` URLs, serve the folder over a tiny local HTTP server instead, e.g.:
>
> 
> python3 -m http.server 8000
> 
>
> then visit <http://localhost:8000>.

## Host it on GitHub Pages

This is a fully static site, so GitHub Pages can serve it directly from your repository.

1. Create a GitHub repository and push these files to it:

   
   git init
   git add .
   git commit -m "Chip Market"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   

2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose the **`main`** branch and the **`/ (root)`** folder, then **Save**.
5. Wait a minute for the first deploy, then visit:

   
   https://<you>.github.io/<repo>/
   

The included `.nojekyll` file tells GitHub Pages to serve all files verbatim (skipping Jekyll processing), so the JS modules and assets load correctly.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and entry point |
| `app.js` | Screen rendering and hash routing |
| `domain.js` | Round, allocation, normalization, and P&L logic |
| `store.js` | In-memory state plus persistence wiring |
| `persistence.js` | `localStorage` read/write |
| `sample-data.js` | The dismissable pre-populated sample round |
| `icons.js` | Inline SVG icons |
| `styles.css` | Styling |
