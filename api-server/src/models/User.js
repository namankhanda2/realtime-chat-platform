import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: [/^[a-zA-Z0-9_]+$/, "username may only contain letters, numbers and underscore"],
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "invalid email address"],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    displayName: {
      type: String,
      default: "",
    },
    avatarUrl: {
      type: String,
      default: "",
    },
    refreshToken: {
      type: String,
      default: null,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName || this.username,
    avatarUrl: this.avatarUrl || "",
    lastSeenAt: this.lastSeenAt,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model("User", userSchema);