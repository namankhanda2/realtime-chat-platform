import { User } from "../models/User.js";
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";
import { pubClient } from "../config/redis.js";

const TYPING_TTL_SECONDS = 4;

function previewText(type, body, fileName, kind) {
  if (type === "image") return "Photo";
  if (type === "file") return `File: ${fileName || "attachment"}`;
  const trimmed = (body || "").trim();
  return trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed;
}

export async function registerSocketHandlers(io, socket) {
  const userId = socket.user.id;

  // ---- presence: register this socket under the user --------------------
  const presenceKey = "presence"; // hash: userId -> online socket count

  // join personal + global rooms
  socket.join(`user:${userId}`);
  socket.join("presence");

  // join rooms for existing conversations
  const convos = await Conversation.find({ members: userId }).select("_id").lean();
  convos.forEach((c) => socket.join(`conv:${c._id.toString()}`));

  const count = await pubClient.hincrby(presenceKey, userId, 1);
  if (count === 1) {
    socket.broadcast.to("presence").emit("presence:update", { userId, online: true });
  }

  // ---- conv:join — user opened a chat room -------------------------------
  socket.on("conv:join", async ({ conversationId } = {}) => {
    try {
      const conv = await Conversation.findOne({
        _id: conversationId,
        members: userId,
      });
      if (!conv) throw new Error("not a member");
      socket.join(`conv:${conversationId}`);
    } catch (err) {
      socket.emit("error:event", { error: err.message });
    }
  });

  // ---- message:send — persist + broadcast to the room --------------------
  socket.on(
    "message:send",
    async ({ conversationId, body = "", type = "text", fileUrl = "", fileName = "", fileSize = 0 } = {}) => {
      try {
        if (!conversationId) throw new Error("conversationId required");
        const conv = await Conversation.findOne({ _id: conversationId, members: userId });
        if (!conv) throw new Error("not a member of this conversation");

        const clean = String(body).trim().slice(0, 4000);
        const isAttachment = type === "image" || type === "file";
        if (!clean && !isAttachment) return;

        const message = await Message.create({
          conversationId: conv._id,
          senderId: userId,
          type,
          body: clean,
          fileUrl: fileUrl || "",
          fileName: fileName || "",
          fileSize: fileSize || 0,
          readBy: [userId],
        });

        const payload = {
          id: message._id.toString(),
          conversationId: conversationId,
          senderId: userId,
          type: message.type,
          body: message.body,
          fileUrl: message.fileUrl,
          fileName: message.fileName,
          fileSize: message.fileSize,
          createdAt: message.createdAt,
          readBy: [userId],
        };

        // update conversation preview + touch for sorting
        await Conversation.updateOne(
          { _id: conv._id },
          {
            $set: {
              latestMessage: message._id,
              lastMessagePreview: previewText(type, message.body, fileName, message.type),
            },
            $currentDate: { updatedAt: true },
          }
        );

        io.to(`conv:${conversationId}`).emit("message:new", payload);
      } catch (err) {
        socket.emit("error:event", { error: err.message });
      }
    }
  );

  // ---- typing indicator (Redis-backed debounce) --------------------------
  socket.on("typing", async ({ conversationId } = {}) => {
    if (!conversationId) return;
    const key = `typing:${conversationId}:${userId}`;
    await pubClient.setex(key, TYPING_TTL_SECONDS, "1");
    socket.to(`conv:${conversationId}`).emit("user:typing", {
      conversationId,
      userId,
      at: Date.now(),
    });
  });

  socket.on("stopped-typing", ({ conversationId } = {}) => {
    if (!conversationId) return;
    socket.to(`conv:${conversationId}`).emit("user:stopped-typing", {
      conversationId,
      userId,
    });
  });

  // ---- message:read — bulk mark + notify sender --------------------------
  socket.on("message:read", async ({ conversationId } = {}) => {
    if (!conversationId) return;
    try {
      const conv = await Conversation.findOne({ _id: conversationId, members: userId });
      if (!conv) return;

      const res = await Message.updateMany(
        {
          conversationId: conv._id,
          senderId: { $ne: userId },
          readBy: { $ne: userId },
        },
        { $addToSet: { readBy: userId } }
      );
      if (res.modifiedCount > 0) {
        io.to(`conv:${conversationId}`).emit("message:read", {
          conversationId,
          readerId: userId,
        });
      }
    } catch (err) {
      socket.emit("error:event", { error: err.message });
    }
  });

  // ---- disconnect: clear presence -----------------------------------------
  socket.on("disconnect", async () => {
    const remaining = await pubClient.hincrby(presenceKey, userId, -1);
    if (remaining <= 0) {
      await pubClient.hdel(presenceKey, userId);
      const lastSeenAt = new Date();
      await User.updateOne({ _id: userId }, { $set: { lastSeenAt } });
      io.to("presence").emit("presence:update", {
        userId,
        online: false,
        lastSeenAt: lastSeenAt.toISOString(),
      });
    }
  });
}