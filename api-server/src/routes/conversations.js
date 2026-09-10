import { Router } from "express";
import { User } from "../models/User.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { requireAuth } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { asyncWrap } from "../utils/helpers.js";

const router = Router();
router.use(apiLimiter);

const DEFAULT_LIMIT = 50;

// GET /api/conversations — list my conversations (desc by last activity)
router.get(
  "/",
  requireAuth,
  asyncWrap(async (req, res) => {
    const convos = await Conversation.find({ members: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(50);

    const userIds = new Set();
    convos.forEach((c) => c.members.forEach((m) => m.toString() !== req.user.id && userIds.add(m.toString())));
    const users = await User.find({ _id: { $in: [...userIds] } });
    const userMap = new Map(users.map((u) => [u._id.toString(), u.toSafeJSON()]));

    const result = await Promise.all(
      convos.map(async (c) => {
        const members = c.members
          .map((m) => m.toString())
          .filter((id) => id !== req.user.id)
          .map((id) => userMap.get(id))
          .filter(Boolean);

        let latestMessage = null;
        if (c.latestMessage) {
          latestMessage = await Message.findById(c.latestMessage).lean();
          latestMessage = latestMessage
            ? {
                id: latestMessage._id.toString(),
                type: latestMessage.type,
                body: latestMessage.body,
                fileUrl: latestMessage.fileUrl,
                senderId: latestMessage.senderId.toString(),
                createdAt: latestMessage.createdAt,
                readBy: latestMessage.readBy.map((x) => x.toString()),
              }
            : null;
        }

        return {
          id: c._id.toString(),
          isGroup: c.isGroup,
          name: c.name || members.map((m) => m.username).join(", "),
          members,
          latestMessage,
          lastMessagePreview: c.lastMessagePreview,
          updatedAt: c.updatedAt,
        };
      })
    );

    res.json(result);
  })
);

// POST /api/conversations — find or create a direct chat with { userId }
router.post(
  "/",
  requireAuth,
  asyncWrap(async (req, res) => {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    if (userId === req.user.id) return res.status(400).json({ error: "cannot chat with yourself" });

    const peer = await User.findById(userId);
    if (!peer) return res.status(404).json({ error: "user not found" });

    const existing = await Conversation.findOne({
      isGroup: false,
      members: { $all: [req.user.id, userId], $size: 2 },
    });

    if (existing) {
      return res.json({ id: existing._id.toString(), created: false });
    }

    const created = await Conversation.create({
      members: [req.user.id, userId],
      participantCount: 2,
      isGroup: false,
    });
    res.status(201).json({ id: created._id.toString(), created: true });
  })
);

// GET /api/conversations/:id/messages?cursor=&limit= — cursor-paginated history
router.get(
  "/:id/messages",
  requireAuth,
  asyncWrap(async (req, res) => {
    const conv = await Conversation.findOne({ _id: req.params.id, members: req.user.id });
    if (!conv) return res.status(404).json({ error: "conversation not found" });

    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, 100);
    const cursor = req.query.cursor;

    const q = { conversationId: conv._id };
    if (cursor) q.createdAt = { $lt: new Date(cursor) };

    const messages = await Message.find(q).sort({ createdAt: -1 }).limit(limit + 1);
    const hasMore = messages.length > limit;
    const slice = messages.slice(0, limit).reverse(); // oldest-first for display

    res.json({
      messages: slice.map((m) => ({
        id: m._id.toString(),
        conversationId: m.conversationId.toString(),
        senderId: m.senderId.toString(),
        type: m.type,
        body: m.body,
        fileUrl: m.fileUrl,
        fileName: m.fileName,
        fileSize: m.fileSize,
        createdAt: m.createdAt,
        readBy: m.readBy.map((x) => x.toString()),
      })),
      hasMore,
      nextCursor: hasMore ? slice[0].createdAt.toISOString() : null,
    });
  })
);

export default router;