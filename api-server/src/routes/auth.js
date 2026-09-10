import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import {
  requireAuth,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { asyncWrap, hashToken, buildAvatar } from "../utils/helpers.js";

const router = Router();

const BCRYPT_ROUNDS = 12;

function tokenBundle(user) {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  return { accessToken, refreshToken, user: user.toSafeJSON() };
}

// POST /api/auth/register
router.post(
  "/register",
  authLimiter,
  asyncWrap(async (req, res) => {
    const { username, email, password, displayName } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({ error: "username, email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "password must be at least 8 characters" });
    }

    const duplicate = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });
    if (duplicate) {
      return res.status(409).json({ error: "username or email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName || username,
      avatarUrl: buildAvatar(username),
    });

    const bundle = tokenBundle(user);
    user.refreshToken = hashToken(bundle.refreshToken);
    await user.save();

    res.status(201).json(bundle);
  })
);

// POST /api/auth/login
router.post(
  "/login",
  authLimiter,
  asyncWrap(async (req, res) => {
    const { emailOrUsername, password } = req.body || {};
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: "credentials required" });
    }

    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername },
      ],
    }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const bundle = tokenBundle(user);
    user.refreshToken = hashToken(bundle.refreshToken);
    await user.save();

    res.json(bundle);
  })
);

// POST /api/auth/refresh — rotate refresh token
router.post(
  "/refresh",
  authLimiter,
  asyncWrap(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: "refresh token required" });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: "invalid or expired refresh token" });
    }

    const user = await User.findById(payload.sub).select("+refreshToken");
    if (!user || user.refreshToken !== hashToken(refreshToken)) {
      return res.status(401).json({ error: "refresh token has been revoked" });
    }

    const bundle = tokenBundle(user);
    user.refreshToken = hashToken(bundle.refreshToken);
    await user.save();

    res.json(bundle);
  })
);

// POST /api/auth/logout — revoke refresh token server-side
router.post(
  "/logout",
  asyncWrap(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      await User.updateOne(
        { refreshToken: hashToken(refreshToken) },
        { $unset: { refreshToken: 1 } }
      );
    }
    res.status(204).end();
  })
);

// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  asyncWrap(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "user not found" });
    res.json(user.toSafeJSON());
  })
);

export default router;