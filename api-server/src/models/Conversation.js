import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    participantCount: {
      type: Number,
      default: 2,
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      default: "",
    },
    latestMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessagePreview: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// enforce exactly 2 members for direct chats
conversationSchema.index({ members: 1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);