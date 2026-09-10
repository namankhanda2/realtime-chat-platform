# Engineering Interview — Real-Time Chat Platform

A one-page, code-accurate walkthrough of the implementation, strengths, honest gaps, and the Q&A most likely to come up in an SDE interview. Everything below is verifiable in the source.

## Architecture

```
React SPA ──▶ nginx ──┬─▶ api-server (Express, :5000) ──▶ Mongo Atlas (state)
                      └─▶ ws-server  (Socket.IO, :5001) ─▶ Redis (presence, typing, rate limits)
```

- Same-origin routing: nginx serves the SPA, proxies `/api/` + `/uploads/` → api, `/socket.io/` → ws (`deploy/nginx.conf.template`).
- Local 5-service compose (nginx/api/ws/mongo/redis) with the Socket.IO **Redis pub/sub adapter** enabled; on managed Redis (Upstash, no pub/sub) it runs the in-memory adapter (`ws-server/src/index.js:23-30`).
- Single-container build for free PaaS hosts: nginx + api + ws under a 3-second supervisor poller; exits if any child dies so the platform restarts it (`deploy/entrypoint.sh`).

## Verified state

- **Auth**: bcrypt(12), `passwordHash` `select:false`; stateless access JWT (15m) + revocable refresh JWT (7d) stored as SHA-256; refresh **rotation on every use**, real **revocation on logout/reuse** (`api-server/src/routes/auth.js`, `middleware/auth.js`).
- **REST**: user search, find-or-create 1:1 chat, membership-checked **cursor-paginated** history (`routes/conversations.js:99-133`).
- **WebSockets**: JWT in handshake (`ws-server/src/index.js:33-46`), per-socket Redis presence hash with boundary broadcasts, `message:send` → Mongo + preview touch + room broadcast, Redis-setex typing, bulk `$addToSet` read receipts, access checks on every event (`ws-server/src/socket/handlers.js`).
- **Uploads**: multer, 15 MB cap, MIME allowlist, randomized names (`api-server/src/middleware/errorHandler.js`).
- **Client**: single-flight refresh interceptor with `_retry`, reactive logout, Socket.IO singleton, live previews, typing/read UI (`client/src/utils/api.js`, `client/src/context/AuthContext.jsx`).
- **Safety**: helmet, `trust proxy`, Redis-backed rate limits (auth 20/15m, api 120/min), 1 MB body, 4000-char messages.
- **E2E**: 22/22 pass against the live public URL over real TLS → nginx → api/ws → Atlas + Upstash.

## Honest gaps (say these before being asked)

- Group chat: schema flag exists (`isGroup`, `name`), no UI/path to create one.
- `stopped-typing` server handler is a no-op stub; client only emits `typing` (`ChatWindow.jsx:103-108`).
- `/uploads` served without auth (hotlinkable URLs).
- Tokens in `localStorage` → XSS-theft tradeoff (no cookies, so no CSRF — classic either/or).
- `message:send` is at-most-once (no client id / dedup).
- Sidebar + inbox capped at latest 50, no pagination there.
- Single-container deploy is one replica by design; scaling story is the compose + Redis adapter path.

## Interview Q&A

**1. Trace a message from keystroke to the other tab.**
Client emits `message:send` → handshake-verified JWT → membership check → Mongo `Message.create` (`readBy=[sender]`) → `Conversation.updateOne` sets `latestMessage` + preview + `$currentDate updatedAt` → `io.to(conv).emit("message:new")` → client dedups by id, appends, sidebar re-sorts (`handlers.js:49-102`).

**2. Why split REST and WS into two servers behind nginx?**
Independent scaling: REST is stateless/horizontal; WS scales via the Redis adapter sharing rooms+events across instances. nginx owns TLS/static/gzip/socket upgrade. Single-container build collapses all three when a host only allows one container.

**3. How is the refresh token rotated and revoked?**
Stateless JWTs can't be revoked server-side, so we store `sha256(refresh)`. `/refresh` verifies it, issues a new pair, and stores the new hash (rotation). `/logout` unsets it. A stolen/reused old token fails the hash compare → 401 (`auth.js:91-118,121-133`).

**4. Why SHA-256, not bcrypt, for the refresh token?**
bcrypt's cost exists for low-entropy secrets (passwords). The refresh token is a high-entropy JWT — a fast hash is correct and cheap.

**5. How does the client survive an expired access token mid-flight?**
Single-flight interceptor: one shared `/refresh` promise (`refreshing`), retry the original request once via `_retry`, and on refresh failure dispatch `auth:logout` → revoke + redirect (`utils/api.js:32-63`).

**6. How is the WS connection authenticated vs forged?**
`handshake.auth.token` verified in the io middleware with `payload.type === "access"` (`ws/index.js:33-46`); invalid → `connect_error("unauthorized")` → client logs out.

**7. What stops brute-force and API flooding?**
Two Redis-backed `express-rate-limit` stores keyed by real client IP (`trust proxy` behind nginx): auth 20/15min, general 120/min. Follow-up: layer per-user-id limits and upload limiting.

**8. Why is the app CSRF-immune despite no CSRF tokens?**
Credentials are not in cookies; they travel in `Authorization`/handshake. CORS `origin:true` means a foreign origin can't read responses. The residual risk is XSS stealing localStorage tokens.

**9. Why cursor pagination instead of offset?**
Cursor = `createdAt` of the oldest loaded message; query `< cursor`, `sort -1`, `limit+1` to detect `hasMore`, reverse for display (`conversations.js:112-131`). New messages arriving don't shift your page boundaries.

**10. Which indexes exist and what do they serve?**
`{conversationId:1, createdAt:-1}` on messages (history + latest-message hot path, `models/Message.js:49`) and `members` on conversations. Follow-up: add `updatedAt:-1` for the sidebar sort under load.

**11. Why are Mongoose schemas duplicated across api-server and ws-server?**
Separate processes with separate connections; they agree by collection name, not by class. Follow-up: extract to a shared package to prevent drift.

**12. How is presence accurate across multiple sockets?**
Redis hash `presence: userId → socket count`. `hincrby +1` and broadcast online only on `0→1`; `-1` to 0 → `hdel`, write `lastSeenAt`, broadcast offline (`handlers.js:29-32,151-163`).

**13. How is typing implemented without event spam?**
Server `setex typing:{conv}:{user} 4s` + broadcast; client adds to a Set, auto-removes after 3.5s (`ChatWindow.jsx:53-63`). Known stub: `stopped-typing` not sent by the client.

**14. How do read receipts stay cheap with many unread messages?**
Bulk `updateMany senderId≠me ∧ readBy∌me → $addToSet` then one room broadcast; UI renders ✓✓ when `readBy.length > 1` (`handlers.js:125-148`).

**15. Explain the single-container supervisor's failure model.**
Entrypoint spawns nginx + api + ws and every 3s `kill -0`s each PID; any death → kill all, `exit 1` so the host restarts the container. Nginx `daemon off`, api/ws pinned 5000/5001, nginx on `$PORT` (`deploy/entrypoint.sh`).

**16. Why 86400s timeouts on `/socket.io/`?**
Keep the WebSocket/HTTP-upgraded channels alive across the proxy without idle reconnects; the block also sets `Upgrade`/`Connection` correctly (`deploy/nginx.conf.template:49-60`).

**17. What does the E2E suite prove — and omit?**
Proves real flows over real infra: registration, rotation, find-or-create, live 2-way messaging, typing, read receipts, presence, revocation, 401s, rate limiting (22 assertions, `client/e2e.mjs`). Omits: uploads, deep pagination, group logic, reconnect storms, multi-instance adapter behavior.

**18. If a WS node dies, what is lost?**
Rooms/presence are Redis-backed, clients auto-reconnect; only messages in flight before the Mongo write are lost (at-most-once). That's the main reason to add client-side dedup ids.

**19. One change before production?**
Make `message:send` idempotent (client `uid` + unique index) for at-least-once delivery, move uploads off local disk to object storage with signed URLs, and scope the `/uploads` mount behind auth.