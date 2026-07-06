import express from "express";
import {
  adminLogin,
  adminLogout,
  getCurrentAdmin,
  listVendors,
  startImpersonation,
  listAuditLogs,
  getActiveSessions,
  forceEndImpersonation,
  getDashboardStats,
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

// Dashboard stats
router.get("/dashboard/stats", requireAdmin, getDashboardStats);

// Impersonation session management
router.get("/impersonation-sessions/active", requireAdmin, getActiveSessions);
router.post("/impersonation-sessions/:sessionId/end", requireAdmin, forceEndImpersonation);

export default router;
