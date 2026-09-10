import { Router } from "express";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { asyncWrap } from "../utils/helpers.js";

const router = Router();
router.use(apiLimiter);

// GET /api/users/search?q=  — search other users
router.get(
  "/search",
  requireAuth,
  asyncWrap(async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const users = await User.find({
      $and: [
        { _id: { $ne: req.user.id } },
        {
          $or: [
            { username: new RegExp(q, "i") },
            { displayName: new RegExp(q, "i") },
          ],
        },
      ],
    })
      .limit(10)
      .select("-refreshToken");

    res.json(users.map((u) => u.toSafeJSON()));
  })
);

// GET /api/users/:id — public profile
router.get(
  "/:id",
  requireAuth,
  asyncWrap(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "user not found" });
    res.json(user.toSafeJSON());
  })
);

export default router;