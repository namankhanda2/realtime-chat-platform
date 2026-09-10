import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";

export function signAccessToken(userId) {
  return jwt.sign(
    { sub: userId.toString(), type: "access", jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

export function signRefreshToken(userId) {
  return jwt.sign(
    { sub: userId.toString(), type: "refresh", jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_TTL || "7d" }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "missing access token" });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: "invalid or expired access token" });
  }
}