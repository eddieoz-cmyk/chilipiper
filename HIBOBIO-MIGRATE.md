# Move to hibobio org + Project #42

Target: [hibobio Project #42](https://github.com/orgs/hibobio/projects/42)

## Why this needs an org admin

Your GitHub user can push to personal repos but **cannot create private repositories in `hibobio`**. A direct transfer failed with:

> You don't have the permission to create private repositories on hibobio

This repo contains **prospect emails** in `data/chilipiper/` — it must stay **private**.

## Step 1 — Org admin (one time)

Ask a `hibobio` org admin to:

1. **Create** a private repo: `hibobio/chilipiper` (or another name — update `REPO_NAME` in the script)
2. **Grant you** `Maintain` or `Admin` on that repo
3. *(Optional)* Enable **Settings → Pages → Source: GitHub Actions** after the first push

## Step 2 — You: authenticate with extra scopes

```bash
gh auth login -h github.com -s repo,workflow,read:project,project
```

`workflow` is required to push `.github/workflows/pages.yml`.

## Step 3 — Migrate

```bash
chmod +x scripts/migrate-to-hibobio.sh
./scripts/migrate-to-hibobio.sh
```

This will:

- Push `main` to `https://github.com/hibobio/chilipiper`
- Add the repo to **Project #42** (if project scopes are granted)
- Print the GitHub Pages URL when ready

## Manual: add to Project #42

If the script can't link the project automatically:

1. Open https://github.com/orgs/hibobio/projects/42
2. **Add item** → **Repository** → select `hibobio/chilipiper`

## After migration

- Update bookmarks: `https://hibobio.github.io/chilipiper/meetings.html`
- Retire personal repo `eddieoz-cmyk/chilipiper` (archive or delete after confirming org copy)
- Refresh data: `./scripts/sync-chilipiper-data.sh` → commit → push

## Transfer alternative (admin)

An org admin with repo-creation rights can instead accept a **transfer** from your personal repo:

**Settings → General → Transfer ownership → `hibobio`**

You initiated transfer; it failed until an admin enables private repo creation for transfers or pre-creates the destination.
