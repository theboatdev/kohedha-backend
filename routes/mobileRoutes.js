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
  getMobileUserByEmail,
  voteOnMenuItem,
  getMobileBookingSlots,
  getMobileBookingSlotsByVendor,
  getMobileAvailableDates,
  getMobileAvailableTables,
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

export default router;
