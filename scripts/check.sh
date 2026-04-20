#!/usr/bin/env bash
# Mirrors CI exactly. Run before every commit.
# Usage: bash scripts/check.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Backend: ruff ==="
cd "$ROOT/backend"
"$ROOT/backend/.venv/Scripts/python" -m ruff check .

echo "=== Backend: mypy ==="
"$ROOT/backend/.venv/Scripts/python" -m mypy . --ignore-missing-imports --exclude workers/ --exclude scripts/

echo "=== Mobile: tsc ==="
cd "$ROOT/mobile"
npx tsc --noEmit

echo ""
echo "All checks passed."
