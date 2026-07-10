import express from "express";
import { createRallySubmission } from "../controller/mmrRallyController.js";
import { uploadRallyImages } from "../middleware/upload.js";

const router = express.Router();

router.post("/", uploadRallyImages.array("images", 5), createRallySubmission);

export default router;
