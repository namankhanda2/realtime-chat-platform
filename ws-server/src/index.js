import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
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

// ---- use Redis adapter so messages fan out across WS instances ----------
io.adapter(createAdapter(pubClient, subClient));

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