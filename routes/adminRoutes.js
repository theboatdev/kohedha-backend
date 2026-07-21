import express from "express";
import {
  adminLogin,
  adminLogout,
  getCurrentAdmin,
  createAdmin,
  getAllAdmins,
  toggleAdminStatus,
} from "../controller/adminController.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/login", adminLogin);

// Protected routes (any active admin)
router.get("/me", requireAdmin, getCurrentAdmin);
router.post("/logout", requireAdmin, adminLogout);

// Super admin only routes
router.post("/admins", requireAdmin, requireSuperAdmin, createAdmin);
router.get("/admins", requireAdmin, requireSuperAdmin, getAllAdmins);
router.patch("/admins/:id/status", requireAdmin, requireSuperAdmin, toggleAdminStatus);

export default router;
