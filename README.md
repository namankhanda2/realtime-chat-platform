# Convo — Real-Time Chat Platform (MERN + Redis + Docker)

A production-style real-time messaging application built on the MERN stack, containerized for multi-service deployment.

## Architecture

```
                        ┌──────────────────────────────┐
        browser  ──────▶│  nginx (reverse proxy, :80)  │
        (React)         └──────────────────────────────┘
                expose /          /api/*           /socket.io/*
                        │             │                    │
                        ▼             ▼                    ▼
                 ┌─────────────┐ ┌─────────────┐  ┌─────────────────┐
                 │  React SPA  │ │  api-server │  │   ws-server      │
                 │  (Vite)     │ │  Express    │  │  Socket.IO       │
                 └─────────────┘ └──────┬──────┘  └────────┬────────┘
                                        │                  │
                                        │          Redis pub/sub
                                        ▼                  │
                                 ┌─────────────┐           ▼
                                 │   MongoDB   │  ┌─────────────────┐
                                 └─────────────┘  │ Redis 7         │
                                                  │ (presence,      │
                                                  │  typing, rate   │
                                                  │  limiting)      │
                                                  └─────────────────┘
```

**5 services:** `chat-nginx` (reverse proxy + static) · `chat-api` (REST) · `chat-ws` (WebSocket) · `chat-mongo` · `chat-redis`

## Highlights

| Feature | Implementation |
|---|---|
| **JWT auth** | Access token (15 min) + rotating refresh token (7 d), hashed server-side for revocation, `/auth/refresh` single-flight rotation |
| **Real-time messaging** | Socket.IO with **Redis pub/sub adapter** (`@socket.io/redis-adapter`) so messages fan out across WS instances |
| **Redis usage** | Presence tracking (hash of online socket counts), typing indicators (TTL keys), per-IP rate limiting (`express-rate-limit-redis`) |
| **MongoDB** | Users, conversations, messages with cursor pagination + compound indexes |
| **File sharing** | Multer uploads (15 MB), images vs files, served through Nginx |
| **Read receipts** | Bulk `$addToSet` mark + socket broadcast to sender |
| **Docker** | 3 custom images, shared volumes, bridge network, health-ready design |

## Quick start

```bash
# 1. secrets (or export your own)
cp .env.example .env
#    replace JWT_SECRET / JWT_REFRESH_SECRET:
openssl rand -hex 32   # run twice, paste into .env

# 2. run the whole stack
docker compose up --build

# 3. open
open http://localhost

# 4. stop
docker compose down
```

Register two users in two browser windows to see real-time messaging, typing indicators, read receipts, and presence go online/offline.

### Local dev (no Docker)

```bash
# terminal 1 — api
cd api-server && npm i && npm run dev

# terminal 2 — ws
cd ws-server && npm i && npm run dev

# terminal 3 — client (Vite proxies /api, /socket.io, /uploads)
cd client && npm i && npm run dev
open http://localhost:5173
```

## API surface (REST)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | create user + tokens |
| POST | `/api/auth/login` | issue tokens |
| POST | `/api/auth/refresh` | rotate refresh token |
| POST | `/api/auth/logout` | revoke refresh token |
| GET | `/api/auth/me` | current profile |
| GET | `/api/users/search?q=` | find people |
| GET | `/api/users/:id` | profile |
| GET | `/api/conversations` | my conversations |
| POST | `/api/conversations` | create/find direct chat |
| GET | `/api/conversations/:id/messages` | cursor-paginated history (50 default) |
| POST | `/api/upload` | file upload (multipart, 15 MB) |
| GET | `/health` | api health check |

## Socket events

**client → server:** `conv:join` · `message:send` · `typing` · `stopped-typing` · `message:read`

**server → client:** `message:new` · `user:typing` · `user:stopped-typing` · `message:read` · `presence:update` · `error:event`

## Resume bullets

- Designed a durable 5-service architecture (`nginx` → REST + WebSocket → Mongo/Redis) deployed with Docker Compose
- Implemented real-time messaging using Socket.IO with the Redis pub/sub adapter for multi-instance fan-out
- Built JWT + rotating refresh-token auth with server-side token revocation and Redis-backed sessions
- Applied Redis for presence tracking, typing indicators, and rate limiting (`express-rate-limit-redis`)
- Published containerized services behind an Nginx reverse proxy with WebSocket upgrade support

## Project structure

```
realtime-chat-platform/
├── docker-compose.yml        # 5 services, volumes, network
├── nginx/nginx.conf          # reverse proxy + SPA + WS upgrade
├── api-server/               # Express REST API (JWT, Redis, Multer)
├── ws-server/                # Socket.IO server (Redis adapter)
└── client/                   # React + Vite SPA
```

## Tech stack

React 18 · Vite · Socket.IO 4 · Express 4 · MongoDB 8 (Mongoose) · Redis 7 · JWT · Multer · Nginx · Docker / Docker Compose