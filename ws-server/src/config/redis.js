import { Redis } from "ioredis";

export const pubClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
export const subClient = pubClient.duplicate();

pubClient.on("connect", () => console.log("[ws] Redis connected"));
pubClient.on("error", (err) => console.error("[ws] Redis error:", err.message));