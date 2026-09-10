import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { upload, errorHandler } from "../middleware/errorHandler.js";
import { asyncWrap } from "../utils/helpers.js";

const router = Router();

// POST /api/upload — multipart file upload (single file), 15 MB max
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncWrap(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "no file provided (field name: file)" });
    }

    const isImage = req.file.mimetype.startsWith("image/");
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      kind: isImage ? "image" : "file",
    });
  })
);

// local middleware so multer fileFilter errors flow through errorHandler
router.use(errorHandler);

export default router;