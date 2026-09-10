import mongoose from "mongoose";

export async function connectDB(uri) {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 20000,
    });
    console.log(`[api] MongoDB connected -> ${uri}`);
  } catch (err) {
    console.error("[api] MongoDB connection failed:", err.message);
    process.exit(1);
  }
}