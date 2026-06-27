import mongoose from "mongoose";
import Deal from "../models/dealModel.js";
import Event from "../models/eventModel.js";
import Menu from "../models/menuModel.js";
import Reservation from "../models/reservationModel.js";

// Get vendor dashboard analytics
export const getDashboardAnalytics = async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    // Get current date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    const next30Days = new Date(now);
    next30Days.setDate(next30Days.getDate() + 30);

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );

    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    // Parallel data fetching for performance
    const [
      activeDealsCount,
      upcomingEventsCount,
      monthlyReservationsCount,
      ongoingReservationsCount,
      menuUpvotesResult,
    ] = await Promise.all([
      // Count active deals
      Deal.countDocuments({
        vendorId,
        status: "active",
        isPublished: true,
      }),

      // Count upcoming events in next 30 days
      Event.countDocuments({
        vendorId,
        status: "upcoming",
        isPublished: true,
        eventDate: { $gte: now, $lte: next30Days },
      }),

      // Count monthly reservations
      Reservation.countDocuments({
        vendorId,
        reservationDate: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $in: ["pending", "confirmed"] },
      }),

      // Count ongoing reservations (today's confirmed reservations)
      Reservation.countDocuments({
        vendorId,
        reservationDate: { $gte: startOfToday, $lte: endOfToday },
        status: "confirmed",
      }),

      // Sum all upvotes across the vendor's menu items
      Menu.aggregate([
        { $match: { vendorId: vendorObjectId } },
        { $group: { _id: null, total: { $sum: "$upvotes" } } },
      ]),
    ]);

    const totalMenuUpvotes =
      menuUpvotesResult.length > 0 ? menuUpvotesResult[0].total : 0;

    // Mock data for features not yet implemented
    const mockData = {
      performance: {
        averageRating: 4.7,
        totalRatings: 128,
        savedByUsers: 320,
        peakHours: "Fri & Sat evenings",
      },
    };

    // Send response
    res.status(200).json({
      success: true,
      data: {
        stats: {
          activeDeals: activeDealsCount,
          upcomingEvents: upcomingEventsCount,
          monthlyReservations: monthlyReservationsCount,
          ongoingReservations: ongoingReservationsCount,
          totalMenuUpvotes,
        },
        performance: mockData.performance, // Mock
      },
    });
  } catch (error) {
    console.error("Dashboard analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard analytics",
      error: error.message,
    });
  }
};

// Get reservation analytics with time-based breakdown
export const getReservationAnalytics = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const now = new Date();

    // Get reservations by status
    const reservationsByStatus = await Reservation.aggregate([
      {
        $match: {
          vendorId: vendorId,
          reservationDate: {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get peak hours (most common reservation times)
    const peakHours = await Reservation.aggregate([
      {
        $match: {
          vendorId: vendorId,
          status: "confirmed",
          reservationDate: {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: "$startTime",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        byStatus: reservationsByStatus,
        peakHours: peakHours,
      },
    });
  } catch (error) {
    console.error("Reservation analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reservation analytics",
      error: error.message,
    });
  }
};
