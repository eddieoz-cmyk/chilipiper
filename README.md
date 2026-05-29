# MQL User Journey Dashboard

Web dashboard to track **Marketing Qualified Leads (MQLs)** and their return visits: MQL date, email, when they came back, and which pages they viewed.

## Quick start (no install)

```bash
node server.mjs
```

Open [http://localhost:3847](http://localhost:3847).

**Meetings dashboard** (booked live, held, BDR→AE handoff from Google Sheet): [http://localhost:3847/meetings.html](http://localhost:3847/meetings.html)

**Routing rules dashboard** (Concierge live booking + offline distribution PODs): [http://localhost:3847/routing.html](http://localhost:3847/routing.html)

### Chili Piper API (recommended)

Copy `.env.example` to `.env` and set your API token (Bearer auth — do **not** put the key in the URL):

```bash
cp .env.example .env
# edit .env — set ROUTING_API_TOKEN=your_key
node server.mjs
```

The server loads rules from `https://fire.chilipiper.com/api/fire-edge/v1/org/rule/list` (all pages). Geographic rules (e.g. `APJ | SMB : 50-199`) appear under **Concierge**; other rules under **Offline distribution**. Optional: keep POD mapping from `data/routing-offline-distribution.csv` by leaving that file in place.

### CSV fallback

Without `ROUTING_API_URL`, rules load from CSV snapshots in `data/`.

### Chili Piper export folder (recommended)

Place exports in `../chilipiper` (or set `CHILIPIPER_DATA_DIR`):

| File | Purpose |
|------|---------|
| `meetings.csv` | **Calendar meetings** — every meeting booked in Chili Piper (~7k in 2026): Concierge, Handoff, ChiliCal |
| `concierge.csv` | **Website concierge log** — sessions started on the site (scheduled, disqualified, timed out). Higher count than calendar; only partly overlaps via `MEETING_ID` |
| `chilirules.json` | Routing rules (same shape as Fire API `results`) |
| `users-export-*.csv` | User licenses and workspace membership |

```bash
CHILIPIPER_DATA_DIR=../chilipiper
CHILIPIPER_YEAR=2026
MEETINGS_SOURCE=chilipiper
ROUTING_SOURCE=chilipiper-file
node server.mjs
```

Open [http://localhost:3847/meetings.html](http://localhost:3847/meetings.html) for 2026 KPIs.

### Meetings + handoff Google Sheet

Copy `.env.example` to `.env` and set your spreadsheet (two tabs: concierge meetings and BDR handoff):

```bash
MEETINGS_SOURCE=sheets
MEETINGS_SPREADSHEET_ID=abc123...
MEETINGS_CONCIERGE_GID=0          # from the tab URL: ...#gid=0
MEETINGS_HANDOFF_GID=123456789    # handoff tab gid
```

Until configured, the meetings dashboard uses sample CSVs in `data/meetings-*-sample.csv`. The page also shows **Chili Piper rule count** from the same API as the routing dashboard.

KPIs tracked:

| Metric | How it’s detected |
|--------|-------------------|
| Booked live | `Booked Live` column, booking type, or status containing “live” + “book” |
| Meeting held | Status like completed/held/attended, or dedicated held column |
| BDR → AE handoff | Handoff tab rows, `Handoff to AE` column, or status mentioning handoff |

If your headers differ, set `MEETINGS_COL_*` aliases in `.env` (see `.env.example`).

## What you see

- **MQL list** — email, MQL date, number of return visits, last return
- **Journey timeline** — each return session with timestamp and pages visited in order

## Your CSV data

The dashboard reads **`test.csv`** in the project root by default. Expected columns:

| Column | Purpose |
|--------|---------|
| `MQL_EMAIL` | Lead email |
| `DATE_MQL` | When they became MQL |
| `EVENT_TIMESTAMP` | Page view time (after MQL = return visit) |
| `PAGEVIEW_URL` | Page URL |
| `MATCH_TYPE` | Optional (e.g. matched_by_user_id) |

Return visits are grouped into **30-minute sessions**. Events at or before the MQL timestamp are excluded.

Use a different file:

```bash
CSV_PATH=/path/to/your.csv node server.mjs
```

## Connect real data later

Replace the JSON file reader in `server.mjs` with your CRM or analytics API (HubSpot, Segment, GA4, your DB). Expected shape per MQL:

```json
{
  "id": "mql-001",
  "email": "alex@company.com",
  "mqlDate": "2026-03-15T10:00:00.000Z",
  "visits": [
    {
      "returnedAt": "2026-04-02T14:22:00.000Z",
      "pages": [
        { "path": "/pricing", "title": "Pricing", "viewedAt": "2026-04-02T14:22:10.000Z" }
      ]
    }
  ]
}
```

## Optional: React + SQLite stack

When `npm` is available, see `package.json` for a fuller stack (`npm run dev`). The standalone server above is the default demo.
