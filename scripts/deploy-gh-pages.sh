#!/usr/bin/env bash
# Build site and push to gh-pages branch (no GitHub Actions / workflow scope needed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CHILIPIPER_DATA_DIR="${CHILIPIPER_DATA_DIR:-data/chilipiper}" node scripts/build-static-site.mjs

cd site
git init -q
git checkout -B gh-pages
git add -A
git commit -q -m "Deploy static site $(date -u +%Y-%m-%dT%H:%M:%SZ)"

REMOTE="${1:-origin}"
git push -f "$REMOTE" gh-pages:gh-pages

echo "Pushed gh-pages branch. Enable Pages: branch gh-pages, folder /"
