#!/bin/sh
# Supervises nginx + REST API + Socket.IO inside one container.
# nginx listens on $PORT (host-injected); api/ws pinned to internal 5000/5001.
# Exits if any child dies so the platform restarts the container.

set -e

PORT="${PORT:-7860}"
envsubst '$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

api_server="PORT=5000 node /app/api-server/src/index.js"
ws_server="PORT=5001 node /app/ws-server/src/index.js"

echo "[entry] nginx on :${PORT}, api :5000, ws :5001"
nginx -g 'daemon off;' &
NGINX_PID=$!

sh -c "$api_server" &
API_PID=$!

sh -c "$ws_server" &
WS_PID=$!

cleanup() {
  echo "[entry] shutting down"
  kill $API_PID $WS_PID $NGINX_PID 2>/dev/null || true
  exit 0
}
trap 'cleanup' INT TERM

while :; do
  for pid in $API_PID $WS_PID $NGINX_PID; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[entry] child $pid exited, stopping container"
      kill $API_PID $WS_PID $NGINX_PID 2>/dev/null || true
      exit 1
    fi
  done
  sleep 3
done