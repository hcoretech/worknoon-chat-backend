import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Dynamic runtime fallback generation check
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generates completely unique safe filenames to avoid asset collision issues
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniquePrefix}${path.extname(file.originalname).toLowerCase()}`);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // Strict 15 Megabyte cap restriction parameters
  fileFilter: (req, file, cb) => {
    // Whitelist clean multi-media extensions (Images, docs, archives)
    const safeTypes = /jpeg|jpg|png|gif|pdf|zip|doc|docx/;
    const isValidExt = safeTypes.test(path.extname(file.originalname).toLowerCase());
    const isValidMime = safeTypes.test(file.mimetype);

    if (isValidExt && isValidMime) {
      return cb(null, true);
    }
    cb(new Error('Rejected: Attachment profile format validation failure.'));
  }
});
