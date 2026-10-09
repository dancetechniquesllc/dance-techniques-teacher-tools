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

if rg -n '^(<<<<<<<|=======|>>>>>>>)' --glob '!scripts/prepublish-check.sh' . >/dev/null; then
  echo "Publish stopped: unresolved merge markers were found."
  exit 1
fi

required_text=(
  'admin-home-classes-rosters")?.addEventListener("click",'
  '["Group Photo", "assets/photo-frames/group-photo.png"]'
  '["Dance Day", "assets/photo-frames/dance-day.png"]'
  'Costume Assignments'
  'Ordering Something?'
  'Boys Costume Inventory'
  'Enrollment Changes'
  '253005393017146'
  'data-recital-suggest-split'
  'data-recital-edit-groups'
  'data-recital-performance-select'
  'data-recital-assign-unassigned'
  'recitalHistoryByStudentId'
  'class_recital_performance_groups'
  'class_recital_performance_group_members'
)

for marker in "${required_text[@]}"; do
  if ! rg -F --quiet "$marker" index.html costume-catalog.html supabase/functions/jotform-enrollment-change-webhook/index.ts; then
    echo "Publish stopped: a protected live feature is missing: $marker"
    exit 1
  fi
done

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
