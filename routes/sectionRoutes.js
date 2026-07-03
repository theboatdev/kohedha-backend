import express from "express";
import {
  createSection,
  getSections,
  getSectionById,
  updateSection,
  deleteSection,
} from "../controller/sectionController.js";
import { protect, auditWrites } from "../middleware/auth.js";

const router = express.Router();
router.use(protect);
router.use(auditWrites);

router.get("/", getSections);
router.get("/:id", getSectionById);
router.post("/new-section", createSection);
router.put("/update-section/:id", updateSection);
router.delete("/delete-section/:id", deleteSection);

export default router;