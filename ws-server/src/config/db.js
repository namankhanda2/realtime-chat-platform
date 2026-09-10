import mongoose from "mongoose";

export async function connectDB(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log("[ws] MongoDB connected");
  } catch (err) {
    console.error("[ws] MongoDB connection failed:", err.message);
    process.exit(1);
  }
}