import express from "express";
import {
  adminLogin,
  adminLogout,
  getCurrentAdmin,
} from "../controller/adminController.js";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/login", adminLogin);

// Protected routes
router.get("/me", requireAdmin, getCurrentAdmin);
router.post("/logout", requireAdmin, adminLogout);

export default router;
