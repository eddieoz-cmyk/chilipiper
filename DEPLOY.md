# Deploy meetings dashboard live

## One-time setup

### 1. GitHub (private repo)

Repo: **https://github.com/eddieoz-cmyk/chilipiper** (private — contains prospect emails in CSVs)

```bash
# Install GitHub CLI if needed: https://cli.github.com/
gh auth login

./scripts/github-push.sh
# or explicit URL: ./scripts/github-push.sh https://github.com/eddieoz-cmyk/chilipiper.git
```

This pushes `main` to your existing private repo.

### 2. Render.com

1. Sign up at [render.com](https://render.com) and connect your GitHub account.
2. **New → Blueprint** (or **New → Web Service**).
3. Select the **eddieoz-cmyk/chilipiper** repo.
4. Render reads [`render.yaml`](render.yaml) automatically:
   - Start: `node server.mjs`
   - Health: `/health`
   - Env: `CHILIPIPER_DATA_DIR=data/chilipiper`, etc.
5. Deploy. First boot takes ~2–3 minutes (loads ~7k meetings).

Live URL: `https://chilipiper.onrender.com/meetings.html` (or the name Render assigns)

### 3. Verify

- `https://YOUR-SERVICE.onrender.com/health` → `{"ok":true}`
- `/meetings.html` → KPIs show ~7,414 calendar meetings (2026)

## Refresh data

```bash
./scripts/sync-chilipiper-data.sh
git add data/chilipiper/
git commit -m "Refresh Chili Piper exports"
git push
```

Render redeploys on push. Or click **Refresh** on the dashboard after redeploy.

## Security

- Repo must stay **private** (prospect emails in CSVs).
- Render URL is public to anyone with the link — add Render password protection or auth in a follow-up if needed.
- Never commit `.env` or API tokens.
