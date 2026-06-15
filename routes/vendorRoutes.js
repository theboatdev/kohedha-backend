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
} from "../controller/vendorController.js";
import { protect, authenticate } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/register", registerVendor);
router.post("/login", vendorLogin);

// Registration route
router.put("/profile/complete", authenticate, compeleteRegistration);

// Protected routes (require complete registration)
router.get("/profile", protect, getCurrentVendor);
router.get("/venue-details", protect, getVenueDetails);
router.put("/venue-details", protect, updateVenueDetails);
router.post("/logout", protect, vendorLogout);

export default router;
