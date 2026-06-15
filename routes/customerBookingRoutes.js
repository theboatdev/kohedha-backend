import express from "express";
import {
  getPublicBookingSlot,
  getAvailableTablesForSlot,
  createPublicReservation,
  getReservationByToken,
  cancelPublicReservation,
} from "../controller/customerBookingController.js";

const router = express.Router();

router.get("/slot/:token", getPublicBookingSlot);
router.get("/slot/:token/available-tables", getAvailableTablesForSlot);
router.post("/slot/:token/book", createPublicReservation);
router.get("/reservation/:token", getReservationByToken);
router.patch("/reservation/:token/cancel", cancelPublicReservation);

export default router;
