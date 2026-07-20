import express from "express";
import { firebaseAuth } from "../middleware/firebaseAuth.js";
import {
  getMobileEvents,
  getMobileEventById,
  getMobileDeals,
  getMobileDealById,
  getMobileDealsByVendor,
  getMobileMenuByVendor,
  getMobileVenues,
  saveUserProfile,
  updateUserProfile,
  deleteUserAccount,
  getMobileUserByEmail,
  voteOnMenuItem,
  getMobileBookingSlots,
  getMobileBookingSlotsByVendor,
  getMobileAvailableDates,
  getMobileAvailableTables,
  scanQrCode,
  submitRallyAnswer,
} from "../controller/mobileController.js";

const router = express.Router();

// All /api/mobile/* routes require a valid Firebase ID token
router.use(firebaseAuth);

// Events
router.get("/events", getMobileEvents);
router.get("/events/:id", getMobileEventById);

// Deals
router.get("/deals", getMobileDeals);
router.get("/deals/:id", getMobileDealById);

// QR scan — verify token and return the question for the scanned checkpoint
router.post("/qr-scan", scanQrCode);

// Rally submission — save driver's answer for a checkpoint question
router.post("/rally-submission", submitRallyAnswer);

// Menu item voting
router.post("/menu/:menuItemId/vote", voteOnMenuItem);

// Venues (must be before /:vendorId/* to avoid being swallowed by the param route)
router.get("/venues", getMobileVenues);

// Booking slots (all vendors — must be before /:vendorId/* for same reason)
router.get("/booking-slots", getMobileBookingSlots);

// Per-slot booking routes (must be before /:vendorId/* for same reason)
router.get("/booking-slots/:slotId/available-dates", getMobileAvailableDates);
router.get("/booking-slots/:slotId/available-tables", getMobileAvailableTables);

// Vendor-specific
router.get("/:vendorId/deals", getMobileDealsByVendor);
router.get("/:vendorId/menu", getMobileMenuByVendor);
router.get("/:vendorId/booking-slots", getMobileBookingSlotsByVendor);

// User profile
router.get("/user", getMobileUserByEmail);
router.post("/user/profile", saveUserProfile);
router.put("/user/profile", updateUserProfile);
router.delete("/user/profile", deleteUserAccount);

export default router;
