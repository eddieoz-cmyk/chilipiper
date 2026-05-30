#!/usr/bin/env bash
# Push this repo to hibobio and add it to org Project #42.
# Prerequisites: org admin created the target repo and granted you push access.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ORG="${ORG:-hibobio}"
REPO_NAME="${REPO_NAME:-chilipiper}"
PROJECT_NUMBER="${PROJECT_NUMBER:-42}"
REMOTE_URL="https://github.com/${ORG}/${REPO_NAME}.git"

GH="${GH:-gh}"
if ! command -v "$GH" >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/" >&2
  exit 1
fi

if ! "$GH" auth status >/dev/null 2>&1; then
  echo "Run: gh auth login -s repo,workflow,read:project,project" >&2
  exit 1
fi

echo "Checking ${ORG}/${REPO_NAME} exists…"
if ! "$GH" repo view "${ORG}/${REPO_NAME}" >/dev/null 2>&1; then
  echo "Repository ${ORG}/${REPO_NAME} not found or no access." >&2
  echo "Ask a hibobio org admin to create a private repo and grant you push access." >&2
  echo "See HIBOBIO-MIGRATE.md" >&2
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "Pushing to $REMOTE_URL …"
"$GH" auth setup-git
git push -u origin main

echo "Adding repo to ${ORG} Project #${PROJECT_NUMBER}…"
REPO_NODE=$("$GH" api "repos/${ORG}/${REPO_NAME}" --jq .node_id)
PROJECT_ID=$("$GH" api graphql -f query="
  query(\$org: String!, \$num: Int!) {
    organization(login: \$org) {
      projectV2(number: \$num) { id title url }
    }
  }" -f org="$ORG" -F num="$PROJECT_NUMBER" --jq .data.organization.projectV2.id 2>/dev/null || true)

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "null" ]]; then
  echo "Could not add to Project #${PROJECT_NUMBER} (need read:project + project scopes)." >&2
  echo "Add manually: https://github.com/orgs/${ORG}/projects/${PROJECT_NUMBER}" >&2
  echo "  → Add item → Repository → ${ORG}/${REPO_NAME}" >&2
  exit 0
fi

"$GH" api graphql -f query="
  mutation(\$project: ID!, \$content: ID!) {
    addProjectV2ItemById(input: { projectId: \$project, contentId: \$content }) {
      item { id }
    }
  }" -f project="$PROJECT_ID" -f content="$REPO_NODE"

echo ""
echo "Done."
echo "  Repo:  https://github.com/${ORG}/${REPO_NAME}"
echo "  Pages: https://${ORG}.github.io/${REPO_NAME}/meetings.html (after enabling Pages → GitHub Actions)"
