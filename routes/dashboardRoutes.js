import express from "express";
import {
  getDashboardAnalytics,
  getReservationAnalytics,
} from "../controller/dashboardController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/dashboard/analytics
// @desc    Get vendor dashboard analytics (stats + performance)
// @access  Private
router.get("/analytics", getDashboardAnalytics);

// @route   GET /api/dashboard/reservation-analytics
// @desc    Get detailed reservation analytics
// @access  Private
router.get("/reservation-analytics", getReservationAnalytics);

export default router;
