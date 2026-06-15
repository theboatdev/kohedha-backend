import express from "express";
import {
  createEvent,
  getVendorEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from "../controller/eventController.js";
import { protect } from "../middleware/auth.js";
import { uploadEventImages } from "../middleware/upload.js";

const router = express.Router();

router.use(protect);

router.post("/new", uploadEventImages.single("images"), createEvent);
router.get("/", getVendorEvents);
router.get("/:id", getEventById);
router.put("/:id", uploadEventImages.single("images"), updateEvent);
router.delete("/:id", deleteEvent);

export default router;
