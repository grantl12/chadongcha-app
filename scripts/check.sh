#!/usr/bin/env bash
# Mirrors CI exactly. Run before every commit.
# Usage: bash scripts/check.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PY_VER=$("$ROOT/backend/.venv/Scripts/python" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if [ "$PY_VER" != "3.12" ]; then
  echo "WARNING: local venv is Python $PY_VER, CI uses 3.12 — stub divergence possible"
fi

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
