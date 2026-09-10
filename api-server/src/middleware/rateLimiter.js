import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";

function makeStore(keyPrefix, ttlMs) {
  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: keyPrefix,
    windowMs: ttlMs,
  });
}

// strict limiter for auth endpoints (login brute-force protection)
export const authLimiter = rateLimit({
  store: makeStore("rl:auth:", 15 * 60 * 1000),
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Try again in 15 minutes." },
});

// general API limiter
export const apiLimiter = rateLimit({
  store: makeStore("rl:api:", 60 * 1000),
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Slow down." },
});