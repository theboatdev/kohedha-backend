import express from "express";
import {
  adminLogin,
  adminLogout,
  getCurrentAdmin,
  listVendors,
  startImpersonation,
  listAuditLogs,
} from "../controller/adminController.js";
import { requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/login", adminLogin);

// Protected routes
router.get("/me", requireAdmin, getCurrentAdmin);
router.post("/logout", requireAdmin, adminLogout);
router.get("/vendors", requireAdmin, listVendors);
router.post("/vendors/:id/impersonate", requireAdmin, startImpersonation);
router.get("/audit-logs", requireAdmin, listAuditLogs);

export default router;
