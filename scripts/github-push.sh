#!/usr/bin/env bash
# Push to GitHub (private repo: eddieoz-cmyk/chilipiper).
# Run once after: gh auth login
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO_URL="${1:-https://github.com/eddieoz-cmyk/chilipiper.git}"

GH="${GH:-gh}"
if command -v "$GH" >/dev/null 2>&1 && "$GH" auth status >/dev/null 2>&1; then
  echo "GitHub CLI authenticated as: $("$GH" auth status 2>&1 | sed -n 's/.*account //p' | head -1)"
  # gh sets up git credential helper after login
elif command -v "$GH" >/dev/null 2>&1; then
  echo "Log in first: gh auth login" >&2
  exit 1
else
  echo "Install GitHub CLI (https://cli.github.com/) or push manually:" >&2
  echo "  git remote add origin $REPO_URL" >&2
  echo "  git push -u origin main" >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

echo "Pushing to $REPO_URL ..."
git push -u origin main

echo ""
echo "Done: $REPO_URL"
echo "Next: Render.com → New → Blueprint → select eddieoz-cmyk/chilipiper"
