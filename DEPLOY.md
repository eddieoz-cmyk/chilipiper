# Deploy meetings dashboard (GitHub Pages)

Host on **GitHub Pages** — no Render or other server needed. The site is static HTML/JS plus a pre-built `meetings-data.json` generated in GitHub Actions from your CSV exports.

## One-time setup

### 1. Push code (already done)

Repo: **https://github.com/eddieoz-cmyk/chilipiper** (private)

### 2. Enable GitHub Pages

1. Open **Settings → Pages** on the repo
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` (or run **Actions → Deploy GitHub Pages → Run workflow**)

After the workflow succeeds (~2–3 min), your site is at:

**https://eddieoz-cmyk.github.io/chilipiper/meetings.html**

(Root `/` redirects to `meetings.html`.)

### 3. Verify

- `/meetings.html` — KPIs, filters, report tabs
- Data loads from `/meetings-data.json` (built in CI from `data/chilipiper/`)

## Refresh data

```bash
./scripts/sync-chilipiper-data.sh
git add data/chilipiper/
git commit -m "Refresh Chili Piper exports"
git push
```

GitHub Actions rebuilds and redeploys automatically.

## Local preview (static build)

```bash
npm run build:site
npx serve site
# open http://localhost:3000/meetings.html
```

## Local dev (with API + Refresh)

```bash
node server.mjs
# http://localhost:3847/meetings.html
```

## Security

- **The published Pages URL is public** — anyone with the link can load `meetings-data.json` (prospect emails). Keep the repo private; understand the **live site is still publicly reachable**.
- For access control, use GitHub Enterprise Pages restrictions or a different host with auth.

## Render (optional)

[`render.yaml`](render.yaml) remains if you prefer a Node server with live Refresh API later.
