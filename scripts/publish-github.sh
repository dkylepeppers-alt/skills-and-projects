#!/usr/bin/env bash
# Run locally with an authenticated GitHub CLI to create and populate the private repo.
set -euo pipefail
repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repo_root"
target_repo='dkylepeppers-alt/skills-and-projects'
remote_url="https://github.com/$target_repo.git"
for dependency in git gh node python3; do
  command -v "$dependency" >/dev/null || { echo "Missing dependency: $dependency" >&2; exit 1; }
done
git lfs version >/dev/null
gh auth status --hostname github.com
test "$(gh api user --jq .login)" = 'dkylepeppers-alt' || { echo 'Authenticate as dkylepeppers-alt before publishing.' >&2; exit 1; }
python3 scripts/validate.py
if [ ! -e .git ]; then
  git init -b main
fi
test "$(git branch --show-current)" = main || { echo 'Switch to main before initial publication.' >&2; exit 1; }
existing_remote="$(git remote get-url origin 2>/dev/null || true)"
if [ -n "$existing_remote" ] && [ "$existing_remote" != "$remote_url" ] && [ "$existing_remote" != "git@github.com:$target_repo.git" ]; then
  echo 'Origin points elsewhere; inspect it before publishing.' >&2
  exit 1
fi
git lfs install --local
git add --all
if ! git diff --cached --quiet; then
  git commit -m 'Organize Marinara skills and Nevermore v2 source and release'
fi
git lfs fsck
gh auth setup-git --hostname github.com
if gh repo view "$target_repo" --json nameWithOwner,isPrivate > .git/publish-target.json 2>/dev/null; then
  python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path('.git/publish-target.json').read_text())
if data['nameWithOwner'] != 'dkylepeppers-alt/skills-and-projects' or not data['isPrivate']:
    raise SystemExit('The existing target must be the expected private repository.')
PY
  if [ -z "$existing_remote" ]; then git remote add origin "$remote_url"; fi
  git push -u origin main
else
  if [ -n "$existing_remote" ]; then
    echo 'Origin exists but the target could not be verified. Check access before retrying.' >&2
    exit 1
  fi
  gh repo create "$target_repo" --private --description 'Personal Marinara skills and versioned project sources and releases' --source . --remote origin --push
fi
echo "Published: https://github.com/$target_repo"
