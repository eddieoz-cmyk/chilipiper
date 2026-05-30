#!/usr/bin/env bash
# Copy Chili Piper exports into the repo for deployment.
# Usage: ./scripts/sync-chilipiper-data.sh [source_dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$(dirname "$ROOT")/chilipiper}"
DEST="$ROOT/data/chilipiper"

if [[ ! -d "$SRC" ]]; then
  echo "Source not found: $SRC" >&2
  echo "Usage: $0 [/path/to/chilipiper]" >&2
  exit 1
fi

mkdir -p "$DEST"

MEETINGS_FILE="${CHILIPIPER_MEETINGS_FILE:-Meeting_new.csv}"
if [[ -f "$SRC/$MEETINGS_FILE" ]]; then
  cp "$SRC/$MEETINGS_FILE" "$DEST/$MEETINGS_FILE"
  echo "Copied $MEETINGS_FILE"
else
  echo "Error: missing $SRC/$MEETINGS_FILE" >&2
  exit 1
fi

# Remove legacy exports if present
rm -f "$DEST"/meetings.csv "$DEST"/concierge.csv

if [[ -f "$SRC/chilirules.json" ]]; then
  cp "$SRC/chilirules.json" "$DEST/chilirules.json"
  echo "Copied chilirules.json"
else
  echo "Warning: missing $SRC/chilirules.json" >&2
fi

shopt -s nullglob
users=( "$SRC"/users-export-*.csv )
if [[ ${#users[@]} -gt 0 ]]; then
  rm -f "$DEST"/users-export-*.csv
  for u in "${users[@]}"; do
    cp "$u" "$DEST/"
    echo "Copied $(basename "$u")"
  done
else
  echo "Warning: no users-export-*.csv in $SRC" >&2
fi

echo "Done. Files in $DEST:"
ls -lh "$DEST"
