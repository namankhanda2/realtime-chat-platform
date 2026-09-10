import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on("connect", () => console.log("[api] Redis connected"));
redis.on("error", (err) => console.error("[api] Redis error:", err.message));

export default redis;