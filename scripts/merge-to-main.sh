#!/usr/bin/env bash
# merge-to-main.sh — Merge the current branch into main and push to deployment
#
# Usage:
#   ./scripts/merge-to-main.sh
#
# What it does:
#   1. Checks for uncommitted changes and offers to stage them
#   2. Pulls latest commits from the current branch's remote
#   3. Switches to main, pulls latest
#   4. Merges the feature branch into main
#   5. Pushes main to origin (triggers deployment)
#   6. Reports the deployment workflow URL
#
set -euo pipefail

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "=== merge-to-main.sh ==="
echo "  Current branch: ${CURRENT_BRANCH}"

# If already on main, nothing to merge
if [[ "${CURRENT_BRANCH}" == "main" ]]; then
    echo "  Already on main — pulling and pushing."
    git pull origin main
    git push origin main
    echo "  Done."
    exit 0
fi

# 1. Warn about uncommitted changes (don't auto-commit here — caller should handle that)
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo ""
    echo "  WARNING: You have uncommitted changes. Commit or stash them before merging."
    git status --short
    exit 1
fi

# 2. Pull latest from the remote feature branch (handles Claude desktop ahead-of-local case)
echo ""
echo "  [1/4] Pulling latest from origin/${CURRENT_BRANCH}..."
if git ls-remote --exit-code origin "${CURRENT_BRANCH}" > /dev/null 2>&1; then
    git pull origin "${CURRENT_BRANCH}"
else
    echo "        No remote tracking branch found — skipping pull."
fi

# 3. Switch to main and pull
echo "  [2/4] Updating main..."
git checkout main
git pull origin main

# 4. Merge feature branch into main
echo "  [3/4] Merging ${CURRENT_BRANCH} into main..."
git merge --no-ff "${CURRENT_BRANCH}" -m "Merge branch '${CURRENT_BRANCH}'"

# 5. Push main — fall back to PR if this environment lacks permission
echo "  [4/4] Pushing main to origin..."
if git push origin main 2>/dev/null; then
    echo ""
    echo "=== Merge complete ==="
    LATEST_RUN=$(gh run list --branch main --limit 1 --json url --jq '.[0].url' 2>/dev/null || echo "")
    if [[ -n "${LATEST_RUN}" ]]; then
        echo "  Deployment triggered: ${LATEST_RUN}"
    fi
else
    # Push to main was blocked (e.g. Claude desktop environment).
    # Undo the local merge and create a PR from the feature branch instead.
    echo "  Push to main blocked — creating a pull request instead..."
    git checkout "${CURRENT_BRANCH}"
    git branch -D main 2>/dev/null || true
    git checkout main
    git reset --hard origin/main

    PR_URL=$(gh pr create \
        --base main \
        --head "${CURRENT_BRANCH}" \
        --fill \
        --body "Auto-created by merge-to-main.sh — environment does not have push access to main." \
        2>/dev/null || echo "")

    echo ""
    echo "=== Pull request created ==="
    if [[ -n "${PR_URL}" ]]; then
        echo "  ${PR_URL}"
        echo "  Attempting auto-merge..."
        gh pr merge "${PR_URL}" --auto --merge 2>/dev/null && echo "  Auto-merge enabled — will merge when CI passes." || echo "  Auto-merge unavailable — merge the PR manually at the URL above."
    else
        echo "  Could not create PR automatically."
        echo "  Open: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/compare/main...${CURRENT_BRANCH}"
    fi
fi
