#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Publish stopped: releases must come from the main branch."
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Publish stopped: tracked changes are not committed."
  echo "Commit the intended release, then run scripts/publish.sh again."
  git status --short --untracked-files=no
  exit 1
fi

echo "Checking the release…"
bash scripts/prepublish-check.sh

echo "Publishing $(git rev-parse --short HEAD) to the live main branch…"
git push origin main
echo "Publish complete. GitHub Pages may take a few minutes to refresh."
