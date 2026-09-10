import crypto from "crypto";

// SHA-256 hash of a token, used to store refresh tokens revocably
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function buildAvatar(seed) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=2E75B6&color=ffffff`;
}