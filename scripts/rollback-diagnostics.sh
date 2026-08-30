#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel)
cd "$ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Rollback requires a clean working tree and index." >&2
  exit 2
fi
if [[ ! -f DIAGNOSTICS.patch ]]; then
  echo "DIAGNOSTICS.patch is missing from the repository root." >&2
  exit 3
fi

git apply --check --reverse DIAGNOSTICS.patch
git apply --reverse --index DIAGNOSTICS.patch
git rm --quiet -- DIAGNOSTICS.patch

if git cat-file -e :src/lib/diagnostics/bundle.ts 2>/dev/null; then
  echo "Rollback verification failed: diagnostic bundle module remains in the index." >&2
  exit 4
fi

echo "Diagnostic feature rollback applied and staged."
echo "Review with: git diff --cached --stat"
echo "Commit with: git commit -m 'revert: remove privacy-safe diagnostics'"
