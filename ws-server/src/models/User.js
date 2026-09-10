import mongoose from "mongoose";

export const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      username: String,
      displayName: String,
      avatarUrl: String,
      lastSeenAt: { type: Date, default: Date.now },
    },
    { collection: "users", timestamps: true }
  )
);