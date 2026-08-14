#!/bin/sh
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export FINDREPEATEDSONG_DATA_DIR="${APP_DIR}/data"
export FINDREPEATEDSONG_STATIC_DIR="${APP_DIR}/static"
export FINDREPEATEDSONG_PORT="${FINDREPEATEDSONG_PORT:-38491}"

"${APP_DIR}/findrepeatedsong" &
SERVER_PID=$!

if command -v xdg-open >/dev/null 2>&1; then
  sleep 1
  xdg-open "http://127.0.0.1:${FINDREPEATEDSONG_PORT}" >/dev/null 2>&1 || true
fi

trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM EXIT
wait "$SERVER_PID"
