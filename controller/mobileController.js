import mongoose from "mongoose";
import Event from "../models/eventModel.js";
import Deal from "../models/dealModel.js";
import Menu from "../models/menuModel.js";
import Vendor from "../models/vendorModel.js";
import MobileUser from "../models/mobileUserModel.js";
import BookingSlot from "../models/bookingSlotModel.js";
import Table from "../models/tableModel.js";
import Reservation from "../models/reservationModel.js";
import RallySubmission from "../models/rallySubmissionModel.js";
import { generateOccurrences } from "../utils/recurrenceUtils.js";

function withVendorLocation(doc) {
  const item = doc.toObject ? doc.toObject() : { ...doc };
  const vendor = item.vendorId;
  const vendorId =
    vendor && typeof vendor === "object" && vendor._id
      ? vendor._id.toString()
      : String(item.vendorId ?? "");
  const coords = vendor?.location?.coordinates;
  return {
    ...item,
    vendorId,
    vendorLocation:
      coords?.lat != null && coords?.lng != null
        ? { lat: coords.lat, lng: coords.lng }
        : null,
  };
}

function withDealVenueInfo(doc) {
  const item = doc.toObject ? doc.toObject() : { ...doc };
  const vendor = item.vendorId;
  return {
    ...withVendorLocation(doc),
    venueName: vendor?.companyName || vendor?.location?.businessName || null,
  };
}

function withBookingSlotInfo(doc) {
  const item = doc.toObject ? doc.toObject() : { ...doc };
  const vendor = item.vendorId;
  const vendorId =
    vendor && typeof vendor === "object" && vendor._id
      ? vendor._id.toString()
      : String(item.vendorId ?? "");
  const coords = vendor?.location?.coordinates;
  return {
    ...item,
    vendorId,
    vendorName: vendor?.companyName || vendor?.location?.businessName || null,
    vendorPhone: vendor?.vendorMobile || null,
    vendorCity: vendor?.location?.city || null,
    vendorAddress: vendor?.location?.streetAddress || null,
    vendorLocation:
      coords?.lat != null && coords?.lng != null
        ? { lat: coords.lat, lng: coords.lng }
        : null,
    publicLink:
      typeof doc.getPublicLink === "function" ? doc.getPublicLink() : null,
  };
}

// GET /api/mobile/events
// Returns all published, upcoming events across all vendors
export const getMobileEvents = async (req, res) => {
  try {
    const { category, sortBy, page = 1, limit = 20 } = req.query;

    const filter = { isPublished: true, status: "upcoming" };

    if (category) {
      filter.category = category;
    }

    let sort = { eventDate: 1 }; // Soonest first by default

    if (sortBy === "newest") {
      sort = { createdAt: -1 };
    } else if (sortBy === "oldest") {
      sort = { eventDate: 1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Event.countDocuments(filter);
    const events = await Event.find(filter)
      .populate({ path: "vendorId", select: "location.coordinates" })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: events.map(withVendorLocation),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Mobile] Error fetching events:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching events",
    });
  }
};

// GET /api/mobile/events/:id
// Returns a single published event by ID
export const getMobileEventById = async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      isPublished: true,
    }).populate({ path: "vendorId", select: "location.coordinates" });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or not available",
      });
    }

    res.status(200).json({
      success: true,
      data: withVendorLocation(event),
    });
  } catch (error) {
    console.error("[Mobile] Error fetching event by ID:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching event",
    });
  }
};

// GET /api/mobile/deals
// Returns all published, active deals across all vendors
export const getMobileDeals = async (req, res) => {
  try {
    const { category, sortBy, page = 1, limit = 20 } = req.query;

    const filter = { isPublished: true, status: "active" };

    if (category) {
      filter.category = category;
    }

    let sort = { priority: 1, createdAt: -1 };

    if (sortBy === "newest") {
      sort = { publishedAt: -1 };
    } else if (sortBy === "rating") {
      sort = { rating: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Deal.countDocuments(filter);
    const deals = await Deal.find(filter)
      .populate({
        path: "vendorId",
        select: "companyName location.coordinates location.businessName",
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: deals.map(withDealVenueInfo),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Mobile] Error fetching deals:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deals",
    });
  }
};

// GET /api/mobile/:vendorId/deals
// Returns published, active deals for a specific vendor
export const getMobileDealsByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!mongoose.isValidObjectId(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await Vendor.findOne({
      _id: vendorId,
      isProfileComplete: true,
    }).select("_id");

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const { category, sortBy, page = 1, limit = 20 } = req.query;

    const filter = {
      vendorId,
      isPublished: true,
      status: "active",
    };

    if (category) {
      filter.category = category;
    }

    let sort = { priority: 1, createdAt: -1 };

    if (sortBy === "newest") {
      sort = { publishedAt: -1 };
    } else if (sortBy === "rating") {
      sort = { rating: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Deal.countDocuments(filter);
    const deals = await Deal.find(filter)
      .populate({ path: "vendorId", select: "location.coordinates" })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: deals.map(withVendorLocation),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Mobile] Error fetching vendor deals:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching vendor deals",
    });
  }
};

// GET /api/mobile/:vendorId/menu
// Returns available menu items for a specific vendor
export const getMobileMenuByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!mongoose.isValidObjectId(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await Vendor.findOne({
      _id: vendorId,
      isProfileComplete: true,
    }).select("_id");

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const { category, sortBy, page = 1, limit = 20 } = req.query;
    const filter = { vendorId, is_available: true };

    if (category) {
      filter.category = category;
    }

    let sort = { category: 1, name: 1 };

    if (sortBy === "newest") {
      sort = { createdAt: -1 };
    } else if (sortBy === "oldest") {
      sort = { createdAt: 1 };
    } else if (sortBy === "popular") {
      sort = { upvotes: -1, name: 1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Menu.countDocuments(filter);
    const menuItems = await Menu.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: menuItems,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Mobile] Error fetching vendor menu:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching vendor menu",
    });
  }
};

// GET /api/mobile/venues
// Returns all vendors with a completed profile
export const getMobileVenues = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const filter = { isProfileComplete: true };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Vendor.countDocuments(filter);
    const venues = await Vendor.find(filter)
      .select(
        "_id companyName location businessCategory description profilePicture vendorMobile",
      )
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: venues,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Mobile] Error fetching venues:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching venues",
    });
  }
};

// GET /api/mobile/deals/:id
// Returns a single published deal by ID
export const getMobileDealById = async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      isPublished: true,
    }).populate({ path: "vendorId", select: "location.coordinates" });

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Deal not found or not available",
      });
    }

    res.status(200).json({
      success: true,
      data: withVendorLocation(deal),
    });
  } catch (error) {
    console.error("[Mobile] Error fetching deal by ID:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deal",
    });
  }
};

// POST /api/mobile/user/profile
// Creates a user profile for a Firebase-authenticated user.
// If a profile already exists for this UID it is returned as-is (idempotent).
export const saveUserProfile = async (req, res) => {
  try {
    const { uid, email: tokenEmail } = req.user; // from firebaseAuth middleware
    const { fullName, email, vibes } = req.body;

    if (!fullName) {
      return res.status(400).json({
        success: false,
        message: "fullName is required",
      });
    }

    const resolvedEmail = email || tokenEmail;
    if (!resolvedEmail) {
      return res.status(400).json({
        success: false,
        message: "email is required",
      });
    }

    // Return existing profile if one already exists for this UID
    const existing = await MobileUser.findOne({ firebaseUid: uid });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Profile already exists",
        data: existing,
      });
    }

    const user = await MobileUser.create({
      firebaseUid: uid,
      fullName: fullName.trim(),
      email: resolvedEmail,
      vibes: Array.isArray(vibes) ? vibes : [],
    });

    res.status(201).json({
      success: true,
      message: "Profile created successfully",
      data: user,
    });
  } catch (error) {
    console.error("[Mobile] Error saving user profile:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error saving user profile",
    });
  }
};

// GET /api/mobile/user/by-email?email=user@example.com
// Returns a mobile user profile by email address.
export const getMobileUserByEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "email query parameter is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email",
      });
    }

    const user = await MobileUser.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("[Mobile] Error fetching user by email:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching user",
    });
  }
};

// POST /api/mobile/menu/:menuItemId/vote
// Upvote or downvote a menu item. Calling with the same vote toggles it off.
// Calling with the opposite vote switches it. Requires Firebase auth.
export const voteOnMenuItem = async (req, res) => {
  try {
    const { menuItemId } = req.params;
    const { vote } = req.body;
    const userId = req.user.uid;

    if (!mongoose.isValidObjectId(menuItemId)) {
      return res.status(400).json({ success: false, message: "Invalid menu item ID" });
    }

    if (!vote || !["up", "down"].includes(vote)) {
      return res.status(400).json({
        success: false,
        message: 'vote must be "up" or "down"',
      });
    }

    const menuItem = await Menu.findById(menuItemId);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: "Menu item not found" });
    }

    const existingVoterIndex = menuItem.voters.findIndex((v) => v.userId === userId);
    const existingVote = existingVoterIndex !== -1 ? menuItem.voters[existingVoterIndex].vote : null;

    if (existingVote === vote) {
      // Same vote → toggle off (remove)
      menuItem.voters.splice(existingVoterIndex, 1);
      if (vote === "up") menuItem.upvotes = Math.max(0, menuItem.upvotes - 1);
      else menuItem.downvotes = Math.max(0, menuItem.downvotes - 1);
    } else if (existingVote !== null) {
      // Opposite vote → switch
      menuItem.voters[existingVoterIndex].vote = vote;
      if (vote === "up") {
        menuItem.upvotes += 1;
        menuItem.downvotes = Math.max(0, menuItem.downvotes - 1);
      } else {
        menuItem.downvotes += 1;
        menuItem.upvotes = Math.max(0, menuItem.upvotes - 1);
      }
    } else {
      // No existing vote → add
      menuItem.voters.push({ userId, vote });
      if (vote === "up") menuItem.upvotes += 1;
      else menuItem.downvotes += 1;
    }

    await menuItem.save();

    const userVote = menuItem.voters.find((v) => v.userId === userId)?.vote ?? null;

    res.status(200).json({
      success: true,
      message: userVote ? `${userVote}vote recorded` : "Vote removed",
      data: {
        menuItemId,
        upvotes: menuItem.upvotes,
        downvotes: menuItem.downvotes,
        userVote,
      },
    });
  } catch (error) {
    console.error("[Mobile] Error voting on menu item:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error recording vote",
    });
  }
};

// GET /api/mobile/booking-slots
// Returns all active booking slots across all vendors, including vendor lat/lng.
export const getMobileBookingSlots = async (req, res) => {
  try {
    const { slotType, page = 1, limit = 20 } = req.query;

    const filter = { isActive: true };
    if (slotType) {
      filter.slotType = slotType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await BookingSlot.countDocuments(filter);
    const slots = await BookingSlot.find(filter)
      .populate({
        path: "vendorId",
        select:
          "companyName vendorMobile location.businessName location.city location.streetAddress location.coordinates",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: slots.map(withBookingSlotInfo),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Mobile] Error fetching booking slots:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching booking slots",
    });
  }
};

// GET /api/mobile/:vendorId/booking-slots
// Returns active booking slots for a specific vendor, including vendor lat/lng.
export const getMobileBookingSlotsByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!mongoose.isValidObjectId(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const vendor = await Vendor.findOne({
      _id: vendorId,
      isProfileComplete: true,
    }).select(
      "companyName vendorMobile location.businessName location.city location.streetAddress location.coordinates",
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const { slotType, page = 1, limit = 20 } = req.query;

    const filter = { vendorId, isActive: true };
    if (slotType) {
      filter.slotType = slotType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await BookingSlot.countDocuments(filter);
    const slots = await BookingSlot.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const coords = vendor.location?.coordinates;
    const vendorLocation =
      coords?.lat != null && coords?.lng != null
        ? { lat: coords.lat, lng: coords.lng }
        : null;

    const vendorInfo = {
      vendorId: vendor._id.toString(),
      vendorName:
        vendor.companyName || vendor.location?.businessName || null,
      vendorPhone: vendor.vendorMobile || null,
      vendorCity: vendor.location?.city || null,
      vendorAddress: vendor.location?.streetAddress || null,
      vendorLocation,
    };

    res.status(200).json({
      success: true,
      data: slots.map((slot) => ({
        ...(slot.toObject ? slot.toObject() : { ...slot }),
        ...vendorInfo,
        publicLink:
          typeof slot.getPublicLink === "function"
            ? slot.getPublicLink()
            : null,
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error(
      "[Mobile] Error fetching vendor booking slots:",
      error.message,
    );
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching vendor booking slots",
    });
  }
};

// PUT /api/mobile/user/profile
// Updates fullName, email, and/or vibes for the authenticated user.
export const updateUserProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    const { fullName, email, vibes } = req.body;

    if (!fullName && !email && !Array.isArray(vibes)) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update: fullName, email, vibes",
      });
    }

    const user = await MobileUser.findOne({ firebaseUid: uid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found. Please create a profile first.",
      });
    }

    if (fullName) user.fullName = fullName.trim();
    if (email) user.email = email;
    if (Array.isArray(vibes)) user.vibes = vibes;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("[Mobile] Error updating user profile:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating user profile",
    });
  }
};

// ─── Booking / Reservation ────────────────────────────────────────────────────

// Helper: convert Date → "YYYY-MM-DD" in local time (mirrors customerBookingController)
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// GET /api/mobile/booking-slots/:slotId/available-dates
// Returns available dates for a slot (especially useful for recurring slots).
// Query params: lookAhead (number of days, default 90)
export const getMobileAvailableDates = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { lookAhead } = req.query;

    if (!mongoose.isValidObjectId(slotId)) {
      return res.status(400).json({ success: false, message: "Invalid slot ID" });
    }

    const bookingSlot = await BookingSlot.findOne({ _id: slotId, isActive: true });
    if (!bookingSlot) {
      return res.status(404).json({ success: false, message: "Booking slot not found or inactive" });
    }

    // Non-recurring: return the single slot date
    if (!bookingSlot.isRecurring) {
      return res.status(200).json({
        success: true,
        isRecurring: false,
        availableDates: [bookingSlot.date],
      });
    }

    // Recurring: generate dates within the window
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rangeStart =
      toLocalDateStr(new Date(bookingSlot.dateRange.start)) > toLocalDateStr(today)
        ? new Date(bookingSlot.dateRange.start)
        : today;

    const daysAhead = parseInt(lookAhead) || 90;
    const defaultEnd = new Date(today);
    defaultEnd.setDate(defaultEnd.getDate() + daysAhead);

    let rangeEnd;
    if (bookingSlot.dateRange.end) {
      rangeEnd =
        toLocalDateStr(new Date(bookingSlot.dateRange.end)) < toLocalDateStr(defaultEnd)
          ? new Date(bookingSlot.dateRange.end)
          : defaultEnd;
    } else {
      rangeEnd = defaultEnd;
    }

    let availableDates;
    try {
      const allDates = generateOccurrences(bookingSlot.recurrenceRule, rangeStart, rangeEnd);

      const nonExcluded = allDates.filter((date) => {
        const dateStr = toLocalDateStr(date);
        return !bookingSlot.excludedDates.some(
          (excluded) => toLocalDateStr(excluded) === dateStr,
        );
      });

      if (bookingSlot.maxBookings !== null && nonExcluded.length > 0) {
        const startBound = new Date(nonExcluded[0]);
        startBound.setHours(0, 0, 0, 0);
        const endBound = new Date(nonExcluded[nonExcluded.length - 1]);
        endBound.setHours(23, 59, 59, 999);

        const bookingCounts = await Reservation.aggregate([
          {
            $match: {
              bookingSlotId: bookingSlot._id,
              reservationDate: { $gte: startBound, $lte: endBound },
              status: { $in: ["pending", "confirmed"] },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$reservationDate" } },
              count: { $sum: 1 },
            },
          },
        ]);

        const fullyBooked = new Set(
          bookingCounts
            .filter((r) => r.count >= bookingSlot.maxBookings)
            .map((r) => r._id),
        );

        availableDates = nonExcluded.filter((d) => !fullyBooked.has(toLocalDateStr(d)));
      } else {
        availableDates = nonExcluded;
      }
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: `Error generating dates: ${err.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      isRecurring: true,
      dateRange: {
        start: bookingSlot.dateRange.start,
        end: bookingSlot.dateRange.end || "indefinite",
      },
      recurrenceRule: bookingSlot.recurrenceRule,
      availableDates: availableDates.map((d) => toLocalDateStr(d)),
      count: availableDates.length,
    });
  } catch (error) {
    console.error("[Mobile] Error fetching available dates:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// GET /api/mobile/booking-slots/:slotId/available-tables
// Returns tables that are free for the given time window.
// Query params: startTime (HH:mm), endTime (HH:mm), numberOfGuests (optional), date (YYYY-MM-DD, required for recurring slots)
export const getMobileAvailableTables = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { startTime, endTime, numberOfGuests, date } = req.query;

    if (!mongoose.isValidObjectId(slotId)) {
      return res.status(400).json({ success: false, message: "Invalid slot ID" });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "startTime and endTime are required",
      });
    }

    const bookingSlot = await BookingSlot.findOne({ _id: slotId, isActive: true });
    if (!bookingSlot) {
      return res.status(404).json({ success: false, message: "Booking slot not found or inactive" });
    }

    // Determine the date to check
    let checkDate;
    if (bookingSlot.isRecurring) {
      if (!date) {
        return res.status(400).json({
          success: false,
          message: "date parameter is required for recurring slots",
        });
      }
      checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
    } else {
      checkDate = new Date(bookingSlot.date);
      checkDate.setHours(0, 0, 0, 0);
    }

    // Requested time must be within the slot's time window
    if (startTime < bookingSlot.startTime || endTime > bookingSlot.endTime) {
      return res.status(400).json({
        success: false,
        message: `Time must be within ${bookingSlot.startTime} - ${bookingSlot.endTime}`,
      });
    }

    // Build table filter
    const tableFilter = {
      vendorId: bookingSlot.vendorId,
      sectionId: bookingSlot.sectionId,
      isActive: true,
    };
    if (numberOfGuests) {
      tableFilter.seatingCapacity = { $gte: parseInt(numberOfGuests) };
    }

    const allTables = await Table.find(tableFilter).sort({ tableNumber: 1 });

    // Find overlapping reservations on the same day
    const startOfDay = new Date(checkDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(checkDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingReservations = await Reservation.find({
      vendorId: bookingSlot.vendorId,
      reservationDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ["pending", "confirmed"] },
      $or: [
        { startTime: { $lte: startTime }, endTime: { $gt: startTime } },
        { startTime: { $lt: endTime }, endTime: { $gte: endTime } },
        { startTime: { $gte: startTime }, endTime: { $lte: endTime } },
      ],
    });

    const bookedTableIds = new Set(
      existingReservations.map((r) => r.tableId.toString()),
    );

    const availableTables = allTables.filter(
      (table) => !bookedTableIds.has(table._id.toString()),
    );

    res.status(200).json({
      success: true,
      count: availableTables.length,
      data: availableTables,
      checkedDate: toLocalDateStr(checkDate),
    });
  } catch (error) {
    console.error("[Mobile] Error fetching available tables:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// POST /api/mobile/qr-scan
// Body: { location: 1|2|3, token: "<plain-text QR_SCAN_TOKEN>" }
// Verifies the QR token, finds the published mmr-rally-special deal for that
// checkpoint, and returns its question.
export const scanQrCode = async (req, res) => {
  try {
    const { location: rawLocation, token } = req.body;

    if (!token) {
      return res.status(401).json({ success: false, message: "Token is required." });
    }

    const expectedToken = process.env.QR_SCAN_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      return res.status(401).json({ success: false, message: "Invalid or unauthorized token." });
    }

    // Validate location
    const location = parseInt(rawLocation, 10);
    if (!Number.isFinite(location) || ![1, 2, 3].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Invalid checkpoint location. Must be 1, 2, or 3.",
      });
    }

    // Find the published mmr-rally-special deal for this checkpoint
    const deal = await Deal.findOne({
      dealType: "mmr-rally-special",
      rallyLocation: location,
      isPublished: true,
    }).select("dealName question rallyLocation");

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: `No active question found for checkpoint ${location}.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        location,
        dealId: deal._id,
        dealName: deal.dealName,
        question: deal.question || null,
      },
    });
  } catch (error) {
    console.error("[Mobile QR Scan] Error:", error.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// POST /api/mobile/rally-submission
// Body: { dealId, location, driverId, driverName, answer }
// Saves the user's answer for a rally checkpoint question.
export const submitRallyAnswer = async (req, res) => {
  try {
    const { dealId, location: rawLocation, driverId, driverName, answer } = req.body;

    // Required field validation
    if (!dealId || !rawLocation || !driverId || !driverName || !answer) {
      return res.status(400).json({
        success: false,
        message: "dealId, location, driverId, driverName, and answer are all required.",
      });
    }

    const location = parseInt(rawLocation, 10);
    if (!Number.isFinite(location) || ![1, 2, 3].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Invalid checkpoint location. Must be 1, 2, or 3.",
      });
    }

    if (!mongoose.isValidObjectId(dealId)) {
      return res.status(400).json({ success: false, message: "Invalid deal ID." });
    }

    // Confirm the deal exists and belongs to this checkpoint
    const deal = await Deal.findOne({
      _id: dealId,
      dealType: "mmr-rally-special",
      rallyLocation: location,
      isPublished: true,
    }).select("question");

    if (!deal) {
      return res.status(404).json({
        success: false,
        message: "Rally deal not found for the given location.",
      });
    }

    if (!deal.question) {
      return res.status(400).json({
        success: false,
        message: "This deal does not have a question set yet.",
      });
    }

    const submission = await RallySubmission.create({
      location,
      dealId: deal._id,
      driverId: driverId.trim(),
      driverName: driverName.trim(),
      question: deal.question,
      answer: answer.trim(),
      submittedBy: req.user.uid,
    });

    console.log(
      `[Rally Submission] Saved submission ${submission._id} for location ${location}, driver ${driverId}`,
    );

    return res.status(201).json({
      success: true,
      message: "Answer submitted successfully.",
      data: {
        id: submission._id,
        location: submission.location,
        driverId: submission.driverId,
        driverName: submission.driverName,
        question: submission.question,
        answer: submission.answer,
        submittedAt: submission.createdAt,
      },
    });
  } catch (error) {
    console.error("[Rally Submission] Error:", error.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

