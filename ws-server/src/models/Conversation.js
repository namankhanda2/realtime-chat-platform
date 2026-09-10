import mongoose from "mongoose";

export const Conversation = mongoose.model(
  "Conversation",
  new mongoose.Schema(
    {
      members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      isGroup: { type: Boolean, default: false },
      name: { type: String, default: "" },
      latestMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
      lastMessagePreview: { type: String, default: "" },
    },
    { collection: "conversations", timestamps: true }
  )
);