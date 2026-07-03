import express from "express";
import { protect, auditWrites } from "../middleware/auth.js";
import {
  createBookingSlot,
  getBookingSlotById,
  getBookingSlots,
  updateBookingSlot,
  toggleBookingSlotStatus,
  deleteBookingSlot,
  getBookingSlotReservations,
  createRecurringBookingSlot,
  deleteRecurringSeries,
  confirmReservation,
  cancelReservation,
  getAvailableDatesForSlot,
  validateSlotDate,
  getTodayReservations,
} from "../controller/bookingSlotController.js";

const router = express.Router();

// Recurring slot routes
router.post("/recurring", protect, auditWrites, createRecurringBookingSlot);
router.delete(
  "/recurring/:groupId",
  protect,
  auditWrites,
  deleteRecurringSeries,
);

// Public availability endpoints (no auth required)
router.get("/public/:token/available-dates", getAvailableDatesForSlot);
router.get("/public/:token/validate-date", validateSlotDate);

// Today's reservations across all slots
router.get("/reservations/today", protect, auditWrites, getTodayReservations);

// Normal slot routes
router.post("/create", protect, auditWrites, createBookingSlot);
router.get("/:id", protect, auditWrites, getBookingSlotById);
router.get("/", protect, auditWrites, getBookingSlots);
router.put("/:id", protect, auditWrites, updateBookingSlot);
router.delete("/:id", protect, auditWrites, deleteBookingSlot);
router.patch("/:id/status", protect, auditWrites, toggleBookingSlotStatus);
router.get(
  "/:id/reservation",
  protect,
  auditWrites,
  getBookingSlotReservations,
);
router.patch(
  "/:slotId/reservation/confirm/:reservationId",
  protect,
  auditWrites,
  confirmReservation,
);
router.patch(
  "/:slotId/reservation/cancel/:reservationId",
  protect,
  auditWrites,
  cancelReservation,
);

export default router;
