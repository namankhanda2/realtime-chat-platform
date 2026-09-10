import multer from "multer";
import path from "path";
import crypto from "crypto";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = crypto.randomBytes(12).toString("hex");
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

const ALLOWED_TYPES = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  file: [
    "application/pdf",
    "text/plain",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

function fileFilter(req, file, cb) {
  const isImage = ALLOWED_TYPES.image.includes(file.mimetype);
  const isDoc = ALLOWED_TYPES.file.includes(file.mimetype);
  if (isImage || isDoc) {
    cb(null, true);
  } else {
    cb(new Error("File type not allowed"));
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

export function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
  console.error(`[api] ${status} on ${req.method} ${req.originalUrl}:`, err.message);
}