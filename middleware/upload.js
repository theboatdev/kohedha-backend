import multer from "multer";
import path from "path";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

// ── Memory storage (CSV / PDF) ────────────────────────────────────────────────
const memoryStorage = multer.memoryStorage();

const csvPdfFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "text/plain",
    "application/pdf",
  ];
  const allowedExtensions = [".csv", ".pdf"];

  const ext = path.extname(file.originalname).toLowerCase();
  if (
    allowedMimeTypes.includes(file.mimetype) &&
    allowedExtensions.includes(ext)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV and PDF files are allowed"), false);
  }
};

const upload = multer({
  storage: memoryStorage,
  fileFilter: csvPdfFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// Cloudinary storage (menu item images)
const menuImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "koheda/menu-images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1000, height: 1000, crop: "limit" }], // Optimize images
    public_id: (_req, file) => {
      const short = Math.random().toString(36).slice(2, 8);
      const timestamp = Date.now();
      return `m-${timestamp}-${short}`;
    },
  },
});

// Cloudinary storage (event images)
const eventImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "koheda/event-images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1400, height: 900, crop: "limit" }],
    public_id: (_req, file) => {
      const short = Math.random().toString(36).slice(2, 8);
      const timestamp = Date.now();
      return `ev-${timestamp}-${short}`;
    },
  },
});

const imageFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

  const ext = path.extname(file.originalname).toLowerCase();
  if (
    allowedMimeTypes.includes(file.mimetype) &&
    allowedExtensions.includes(ext)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, and WebP images are allowed"), false);
  }
};

export const uploadMenuImage = multer({
  storage: menuImageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
});

export const uploadEventImages = multer({
  storage: eventImageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB, max 1 file
});

// Cloudinary storage (deal images)
const dealImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "koheda/deal-images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1400, height: 900, crop: "limit" }],
    public_id: (_req, file) => {
      const short = Math.random().toString(36).slice(2, 8);
      const timestamp = Date.now();
      return `deal-${timestamp}-${short}`;
    },
  },
});

export const uploadDealImage = multer({
  storage: dealImageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB, max 1 file
});

export default upload;
