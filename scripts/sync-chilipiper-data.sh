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

for f in meetings.csv concierge.csv chilirules.json; do
  if [[ -f "$SRC/$f" ]]; then
    cp "$SRC/$f" "$DEST/$f"
    echo "Copied $f"
  else
    echo "Warning: missing $SRC/$f" >&2
  fi
done

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
