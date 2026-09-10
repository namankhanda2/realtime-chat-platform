# Single-container deployment for free hosts (Hugging Face Spaces).
# Preserves the microservice architecture: nginx as the reverse proxy in front
# of the REST API (5000) and Socket.IO server (5001) on one external port.
#
# Build context: repo root. Secrets come from the host's envVars
# (never baked into the image): MONGODB_URI, REDIS_URL, JWT_SECRET,
# JWT_REFRESH_SECRET.

# Stage 1 — build the React client
FROM node:20-alpine AS client-build
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2 — runtime
FROM node:20-alpine
RUN apk add --no-cache nginx gettext tzdata

WORKDIR /app

# REST API
COPY api-server/package.json api-server/package-lock.json ./api-server/
RUN npm ci --omit=dev --prefix /app/api-server
COPY api-server/src ./api-server/src
RUN mkdir -p /app/api-server/uploads

# WebSocket server
COPY ws-server/package.json ws-server/package-lock.json ./ws-server/
RUN npm ci --omit=dev --prefix /app/ws-server
COPY ws-server/src ./ws-server/src

# built client
COPY --from=client-build /app/dist /usr/share/nginx/html

# nginx template + supervisor entrypoint
COPY deploy/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV PORT=7860 REDIS_ADAPTER=false
EXPOSE 7860
CMD ["/usr/local/bin/entrypoint.sh"]