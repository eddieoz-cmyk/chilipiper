#!/usr/bin/env bash
# Create private GitHub repo and push (run once after `gh auth login`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GH="${GH:-gh}"
if ! command -v "$GH" >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/" >&2
  echo "Or set GH=/path/to/gh" >&2
  exit 1
fi

if ! "$GH" auth status >/dev/null 2>&1; then
  echo "Log in first: gh auth login" >&2
  exit 1
fi

REPO_NAME="${1:-mql-journey-dashboard}"

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote origin already set: $(git remote get-url origin)"
else
  "$GH" repo create "$REPO_NAME" --private --source=. --remote=origin --description "MQL journey and Chili Piper meetings dashboards"
fi

git push -u origin main
echo ""
echo "Pushed to: $("$GH" repo view --json url -q .url)"
echo "Next: connect Render.com → New Web Service → select this repo (render.yaml applies automatically)"
