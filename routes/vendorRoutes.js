import express from "express";
import {
  registerVendor,
  compeleteRegistration,
  vendorLogin,
  getCurrentVendor,
  completeVendorProfile,
  getVenueDetails,
  updateVenueDetails,
  vendorLogout,
  getImpersonationStatus,
} from "../controller/vendorController.js";
import { endImpersonation } from "../controller/adminController.js";
import { protect, authenticate, auditWrites } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/register", registerVendor);
router.post("/login", vendorLogin);

// Registration route
router.put(
  "/profile/complete",
  authenticate,
  auditWrites,
  compeleteRegistration,
);

// Protected routes (require complete registration)
router.get("/profile", protect, getCurrentVendor);
router.get("/venue-details", protect, getVenueDetails);
router.put("/venue-details", protect, auditWrites, updateVenueDetails);
router.post("/logout", protect, vendorLogout);

// Impersonation routes - use `authenticate` (not `protect`) so they work
// even if the impersonated vendor hasn't completed onboarding.
router.get("/impersonation-status", authenticate, getImpersonationStatus);
router.post("/impersonate/end", authenticate, endImpersonation);

export default router;
