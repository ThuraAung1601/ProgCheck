#!/usr/bin/env bash
# start.sh — build frontend then start the server (production mode)
#
# Usage:
#   export GROQ_API_KEY=your_key_here
#   ./start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "──────────────────────────────────────────"
echo "  ProgCheck"
echo "──────────────────────────────────────────"

if [ -z "${GROQ_API_KEY:-}" ]; then
  echo "[warn] GROQ_API_KEY not set — LLM features will be disabled"
  echo "       To enable: export GROQ_API_KEY=your_key_here"
fi

echo ""
echo "[1/2] Building React frontend…"
cd "$ROOT/webui/frontend"
npm install --silent
npm run build
echo "      Done → $ROOT/static/"

echo ""
echo "[2/2] Starting FastAPI server on http://localhost:8000"
cd "$ROOT/webui"
exec uvicorn main:app --host 0.0.0.0 --port 8000 "$@"
