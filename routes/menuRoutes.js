import express from "express";
import upload, { uploadMenuImage } from "../middleware/upload.js";
import {
  uploadMenuCSV,
  analyzeCSV,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuPDF,
  saveEditedPDFMenuItems,
} from "../controller/menuController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

// Single item creation (with optional image)
router.post("/create", uploadMenuImage.single("image"), createMenuItem);

// Route for CSV upload
router.post("/upload-csv", upload.single("file"), uploadMenuCSV);
router.post("/analyze-csv", upload.single("file"), analyzeCSV);
router.get("/", getMenuItems);
router.put("/:id", uploadMenuImage.single("image"), updateMenuItem);
router.delete("/:id", deleteMenuItem);

// Routes for PDF upload
router.post("/upload-pdf", upload.single("file"), uploadMenuPDF);
router.post("/save-pdf", saveEditedPDFMenuItems);

export default router;
