#!/bin/bash
# WeDou N150 restart script. Shipped inside the CI artifact (deploy-agent rsyncs
# the project directory, so runtime deps live OUTSIDE it and are linked back).
set -euo pipefail

PORT=3002
DIR="$HOME/wedou"
DEPS_DIR="$HOME/wedou-deps"
LOCK_FILE=/tmp/wedou-restart.lock
LOG=/tmp/wedou.log

# Serialise with the cron health check. The lock fd MUST be closed for the
# long-running child (9>&-), otherwise node inherits fd 9 and every later
# deploy blocks on flock forever.
exec 9>"$LOCK_FILE"
flock 9

mkdir -p "$DIR" "$DEPS_DIR"

HASH=$(sha256sum "$DIR/package-lock.json" | awk '{print $1}')
MARKER="$DEPS_DIR/.lock-hash"
if [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "$HASH" ]; then
  cp "$DIR/package.json" "$DIR/package-lock.json" "$DEPS_DIR/"
  (
    cd "$DEPS_DIR"
    npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com \
      || npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
  )
  echo "$HASH" > "$MARKER"
fi

ln -sfn "$DEPS_DIR/node_modules" "$DIR/node_modules"

if lsof -ti:$PORT >/dev/null 2>&1; then
  kill $(lsof -ti:$PORT) 2>/dev/null || true
  sleep 1
fi

cd "$DIR"
nohup env PORT="$PORT" NODE_ENV=production node server/index.mjs >> "$LOG" 2>&1 9>&- &
echo "[$(date)] wedou started on $PORT"
