import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./config/db.js";
import redis from "./config/redis.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import conversationRoutes from "./routes/conversations.js";
import uploadRoutes from "./routes/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", true); // behind Nginx: rate-limit per real client IP
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

// shared uploads volume (mapped in docker-compose)
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (req, res) => res.json({ status: "ok", service: "api", uptime: process.uptime() }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/upload", uploadRoutes);

app.use((req, res) => res.status(404).json({ error: "route not found" }));
app.use(errorHandler);

async function start() {
  await connectDB(process.env.MONGODB_URI);
  await redis.ping();
  app.listen(PORT, () => console.log(`[api] listening on :${PORT}`));
}

start().catch((err) => {
  console.error("[api] startup failed:", err.message);
  process.exit(1);
});