import express from "express";
import { createWaitlistEntry } from "../controller/waitlistController.js";

const router = express.Router();

router.post("/", createWaitlistEntry);

export default router;
