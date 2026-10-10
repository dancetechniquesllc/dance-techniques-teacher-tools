#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git fetch --quiet origin main

if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Publish stopped: this checkout does not include the latest live main branch."
  echo "Rebase or merge origin/main, resolve the changes, and run this check again."
  exit 1
fi

git diff --check

node_bin="$(command -v node || true)"
if [[ -z "$node_bin" ]]; then
  bundled_node="/Users/lexiking/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  [[ -x "$bundled_node" ]] && node_bin="$bundled_node"
fi
if [[ -z "$node_bin" ]]; then
  echo "Publish stopped: Node.js is required to validate the app's JavaScript."
  exit 1
fi
"$node_bin" scripts/check-inline-scripts.js index.html
for script in big-stage.js big-stage-order.js big-stage-wizard.js; do
  "$node_bin" --check "$script"
done
echo "JavaScript check passed: recital planner scripts are valid."

if rg -n '^(<<<<<<<|=======|>>>>>>>)' --glob '!scripts/prepublish-check.sh' . >/dev/null; then
  echo "Publish stopped: unresolved merge markers were found."
  exit 1
fi

while IFS='|' read -r marker files feature; do
  [[ -z "$marker" || "$marker" == \#* ]] && continue
  read -r -a search_files <<< "$files"
  if ! rg -F --quiet "$marker" "${search_files[@]}"; then
    echo "Publish stopped: protected feature is missing: $feature"
    echo "Expected marker: $marker"
    exit 1
  fi
done < scripts/protected-features.txt

required_files=(
  assets/photo-frames/group-photo.png
  assets/photo-frames/dance-day.png
  supabase/migrations/20260930165000_class_recital_performance_groups.sql
)

for path in "${required_files[@]}"; do
  if [[ ! -s "$path" ]]; then
    echo "Publish stopped: required asset is missing or empty: $path"
    exit 1
  fi
done

echo "Publish safety check passed: latest live changes are included and protected features are present."
