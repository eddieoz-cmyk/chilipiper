# Chili Piper exports (production data)

These files are copied from your local Chili Piper export folder and committed to the **private** repo so Render can serve the meetings dashboard.

## Refresh live data

```bash
./scripts/sync-chilipiper-data.sh          # default: ../chilipiper
./scripts/sync-chilipiper-data.sh /path/to/exports

git add data/chilipiper/
git commit -m "Refresh Chili Piper exports"
git push
```

Render redeploys automatically after push (~2–3 min).

## Required files

| File | Purpose |
|------|---------|
| `meetings.csv` | Calendar meetings (source of truth) |
| `concierge.csv` | Website form / routing context |
| `chilirules.json` | Routing rule names and regions |
| `users-export-*.csv` | Rep names and emails |
