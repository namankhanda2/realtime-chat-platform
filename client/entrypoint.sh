#!/bin/sh
set -e

CONF=/etc/nginx/nginx.conf
PORT="${PORT:-80}"

if [ -n "$API_URL" ] && [ -n "$WS_URL" ]; then
  # ---------- PaaS mode (Render etc.): full upstream URLs ----------
  echo "nginx PaaS mode -> api: $API_URL  ws: $WS_URL"
  cat > "$CONF" <<CONF
worker_processes auto;
events { worker_connections 1024; }
http {
  include /etc/nginx/mime.types;
  sendfile on;
  client_max_body_size 20m;
  gzip on;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
  server {
    listen $PORT;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location /api/ {
      proxy_pass $API_URL;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_ssl_server_name on;
    }
    location /uploads/ {
      proxy_pass $API_URL;
      proxy_set_header Host \$host;
      proxy_ssl_server_name on;
    }
    location /socket.io/ {
      proxy_pass $WS_URL;
      proxy_http_version 1.1;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_ssl_server_name on;
      proxy_read_timeout 86400;
      proxy_send_timeout 86400;
    }
  }
}
CONF
else
  # ---------- docker-compose mode: internal service names ----------
  echo "nginx docker-compose mode -> api: ${API_HOST:-api}:5000  ws: ${WS_HOST:-ws}:5001"
  API_HOST="${API_HOST:-api}" WS_HOST="${WS_HOST:-ws}" PORT="${PORT:-80}" \
    envsubst '\$API_HOST \$WS_HOST \$PORT' < /etc/nginx/templates/nginx.conf > "$CONF"
fi

exec nginx -g "daemon off;"