import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

import { connectDB } from "./config/db.js";
import { pubClient, subClient } from "./config/redis.js";
import { registerSocketHandlers } from "./socket/handlers.js";

const PORT = process.env.PORT || 5001;

const server = http.createServer();
const io = new Server(server, {
  cors: { origin: true, credentials: false },
  maxHttpBufferSize: 1e6,
});

// ---- Redis adapter --------------------------------------------
// With redis pub/sub the Socket.IO rooms scale across WS instances.
// Managed Redis providers (e.g. Upstash) do not support pub/sub —
// a single WS instance is served by the in-memory adapter instead.
// Set REDIS_ADAPTER=true in environments where Redis supports pub/sub.
if (process.env.REDIS_ADAPTER === "true") {
  await import("@socket.io/redis-adapter").then(async ({ createAdapter }) => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("[ws] using Redis pub/sub adapter");
  });
} else {
  console.log("[ws] using in-memory adapter (set REDIS_ADAPTER=true to enable pub/sub)");
}

// ---- socket auth: verify JWT from handshake ------------------------------
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized: missing token"));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "access") return next(new Error("unauthorized: need access token"));

    socket.user = { id: payload.sub };
    next();
  } catch {
    next(new Error("unauthorized: invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log(`[ws] connected socket=${socket.id} user=${socket.user.id}`);
  registerSocketHandlers(io, socket).catch((err) =>
    console.error("[ws] handler init error:", err.message)
  );
});

async function start() {
  await connectDB(process.env.MONGODB_URI);
  server.listen(PORT, () => console.log(`[ws] Socket.IO listening on :${PORT}`));
}

start().catch((err) => {
  console.error("[ws] startup failed:", err.message);
  process.exit(1);
});