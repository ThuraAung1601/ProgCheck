#!/usr/bin/env bash
# start_dev.sh — hot-reload mode: FastAPI on :8000, React dev server on :3000
#
# Usage:
#   export GROQ_API_KEY=your_key_here
#   ./start_dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${GROQ_API_KEY:-}" ]; then
  echo "[warn] GROQ_API_KEY not set — LLM features will be disabled"
  echo "       To enable: export GROQ_API_KEY=your_key_here"
fi

cleanup() { kill "${BACK_PID:-}" "${FRONT_PID:-}" 2>/dev/null; }
trap cleanup EXIT INT TERM

echo "[dev] Starting FastAPI on :8000…"
cd "$ROOT/webui"
uvicorn main:app --reload --port 8000 &
BACK_PID=$!

echo "[dev] Starting React dev server on :3000…"
cd "$ROOT/webui/frontend"
npm install --silent
REACT_APP_API_BASE=http://localhost:8000 npm start &
FRONT_PID=$!

echo ""
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:3000  (proxies API to :8000)"
echo ""
wait
