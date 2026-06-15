import BookingSlot from "../models/bookingSlotModel.js";
import Section from "../models/sectionModel.js";
import Table from "../models/tableModel.js";
import Reservation from "../models/reservationModel.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { generateOccurrences } from "../utils/recurrenceUtils.js";

// Convert a Date to a YYYY-MM-DD string using LOCAL time (avoids UTC day-shift in non-UTC timezones)
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Create booking
export const createBookingSlot = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const {
      slotName,
      slotType,
      date,
      startTime,
      endTime,
      sectionId,
      description,
      maxBookings,
    } = req.body;

    // Validation
    if (!slotName || !date || !startTime || !endTime || !sectionId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Verify section exists and belongs
    const section = await Section.findOne({
      _id: sectionId,
      vendorId,
      isActive: true,
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found or inactive",
      });
    }

    // Validate time
    if (startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time",
      });
    }

    // Validate date
    const slotDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (slotDate < today) {
      return res.status(400).json({
        success: false,
        message: "Can't create a booking slot for past dates",
      });
    }

    const bookingSlot = await BookingSlot.create({
      vendorId,
      slotName,
      slotType: slotType || "",
      date: new Date(date),
      startTime,
      endTime,
      sectionId,
      description: description || "",
      maxBookings: maxBookings || null,
      isActive: true,
      totalBookings: 0,
    });

    // Populate section info
    const populatedSlot = await BookingSlot.findById(bookingSlot._id).populate(
      "sectionId",
      "sectionName sectionType",
    );

    // Generate public link
    const publicLink = populatedSlot.getPublicLink();

    res.status(201).json({
      success: true,
      message: "Booking slot created successfully",
      data: {
        bookingSlot: populatedSlot,
        publicLink: publicLink,
        publicToken: populatedSlot.publicToken,
      },
    });
  } catch (error) {
    console.error("Create booking slot error: ", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// GET SINGLE BOOKING SLOT BY ID
export const getBookingSlotById = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;

    const bookingSlot = await BookingSlot.findOne({
      _id: id,
      vendorId,
    }).populate("sectionId", "sectionName sectionType");

    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found",
      });
    }

    // Get tables count in this section
    const tablesCount = await Table.countDocuments({
      vendorId,
      sectionId: bookingSlot.sectionId,
      isActive: true,
    });

    res.status(200).json({
      success: true,
      data: {
        ...bookingSlot.toObject(),
        publicLink: bookingSlot.getPublicLink(),
        availableTables: tablesCount,
      },
    });
  } catch (error) {
    console.error("Get booking slot error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get all booking slots for vendor
export const getBookingSlots = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { isActive, date, sectionId } = req.query;

    let filter = { vendorId };

    // Filter by active status
    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    // Filter by date
    if (date) {
      const searchDate = new Date(date);
      const startOfDay = new Date(searchDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(searchDate.setHours(23, 59, 59, 999));
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }

    // Filter by section
    if (sectionId) {
      filter.sectionId = sectionId;
    }

    const bookingSlots = await BookingSlot.find(filter)
      .populate("sectionId", "sectionName sectionType")
      .sort({ date: -1, startTime: -1 });

    // Add public links to each slot
    const slotsWithLinks = bookingSlots.map((slot) => ({
      ...slot.toObject(),
      publicLink: slot.getPublicLink(),
    }));

    res.status(200).json({
      success: true,
      count: slotsWithLinks.length,
      data: slotsWithLinks,
    });
  } catch (error) {
    console.error("Get booking slots error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Update booking slot
export const updateBookingSlot = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;
    const updates = req.body;

    const bookingSlot = await BookingSlot.findOne({ _id: id, vendorId });

    if (!bookingSlot) {
      console.error("[Booking Error] Slot not found");
      return res.status(404).json({
        success: false,
        message: "Booking slot not found",
      });
    }

    // Prevent updating if there are existing bookings
    if (bookingSlot.totalBookings > 0) {
      // You can allow some fields to be updated even with bookings
      const allowedUpdates = ["description", "isActive", "maxBookings"];
      const updateKeys = Object.keys(updates);
      const hasRestrictedUpdates = updateKeys.some(
        (key) => !allowedUpdates.includes(key),
      );

      if (hasRestrictedUpdates) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot update slot details (date, time, section) when bookings exist. You can only update description, status, or max bookings.",
        });
      }
    }

    // If updating section, verify it exists
    if (updates.sectionId) {
      const section = await Section.findOne({
        _id: updates.sectionId,
        vendorId,
        isActive: true,
      });

      if (!section) {
        console.log("[ Booking Error ] Section not found or inactive");
        return res.status(404).json({
          success: false,
          message: "Section not found or inactive",
        });
      }
    }

    // Validate time if updating
    const newStartTime = updates.startTime || bookingSlot.startTime;
    const newEndTime = updates.endTime || bookingSlot.endTime;

    if (newStartTime >= newEndTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time",
      });
    }

    // Don't allow updating these
    Object.keys(updates).forEach((key) => {
      if (key !== "publicToken" && key !== "totalBookings") {
        bookingSlot[key] = updates[key];
      }
    });

    // Update
    await bookingSlot.save();

    const updatedSlot = await BookingSlot.findById(id).populate(
      "sectionId",
      "sectionName sectionType",
    );

    console.log(`Booking updated: ${bookingSlot._id}`);
    res.status(200).json({
      success: true,
      message: "Booking slot updated successfully",
      data: {
        ...updatedSlot.toObject(),
        publicLink: updatedSlot.getPublicLink(),
      },
    });
  } catch (error) {
    console.error("Update booking slot error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Chanege booking slot status
export const toggleBookingSlotStatus = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;

    const bookingSlot = await BookingSlot.findOne({ _id: id, vendorId });

    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found",
      });
    }

    bookingSlot.isActive = !bookingSlot.isActive;
    await bookingSlot.save();

    console.log(`Booking slot: ${bookingSlot.slotName} status updated`);
    res.status(200).json({
      success: true,
      message: `Booking slot ${bookingSlot.isActive ? "activated" : "deactivated"} successfully`,
      data: {
        isActive: bookingSlot.isActive,
      },
    });
  } catch (error) {
    console.error("Toggle booking slot status error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Delete booking slot
export const deleteBookingSlot = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;

    const bookingSlot = await BookingSlot.findOne({ _id: id, vendorId });

    if (!bookingSlot) {
      console.log("Booking slot not found");
      return res.status(404).json({
        success: false,
        message: "Booking slot not found",
      });
    }

    // Check if there are existing bookings
    if (bookingSlot.totalBookings > 0) {
      console.error(
        `Cannot delete booking slot with ${bookingSlot.totalBookings} existing bookings.`,
      );
      return res.status(400).json({
        success: false,
        message: `Cannot delete booking slot with ${bookingSlot.totalBookings} existing bookings. Please cancel bookings first or deactivate the slot.`,
      });
    }

    await BookingSlot.findByIdAndDelete(id);

    console.log("Booking slot deleted successfully");
    res.status(200).json({
      success: true,
      message: "Booking slot deleted successfully",
    });
  } catch (error) {
    console.error("Delete booking slot error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get reservations for a booking slot
export const getBookingSlotReservations = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;
    const { status } = req.query;

    const bookingSlot = await BookingSlot.findOne({ _id: id, vendorId });

    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found",
      });
    }

    // Build query
    const query = { bookingSlotId: id };
    if (status) {
      query.status = status;
    }

    // Get all reservations for this slot
    const reservations = await Reservation.find({
      bookingSlotId: id,
    })
      .populate("tableId", "tableNumber seatingCapacity")
      .populate("sectionId", "sectionName")
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations,
    });
  } catch (error) {
    console.error("Get booking slot reservations error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Confirm reservation
export const confirmReservation = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { slotId, reservationId } = req.params;

    // Verify booking slot exists and belongs to vendor
    const bookingSlot = await BookingSlot.findOne({ _id: slotId, vendorId });
    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found",
      });
    }

    // Get reservation
    const reservation = await Reservation.findOne({
      _id: reservationId,
      bookingSlotId: slotId,
      vendorId,
    });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Validation: Can't confirm if already cancelled or no-show
    if (
      reservation.status === "cancelled" ||
      reservation.status === "completed"
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm a ${reservation.status} reservation`,
      });
    }

    // Update reservation
    reservation.status = "confirmed";
    reservation.confirmedAt = new Date();
    await reservation.save();

    // Populate response
    await reservation.populate("tableId", "tableNumber seatingCapacity");
    await reservation.populate("sectionId", "sectionName");

    res.status(200).json({
      success: true,
      message: "Reservation confirmed successfully",
      data: reservation,
    });
  } catch (error) {
    console.error("Confirm reservation error: ", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Cancel reservation
export const cancelReservation = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { slotId, reservationId } = req.params;
    const { cancellationReason } = req.body;

    // Verify booking slot exists and belongs to vendor
    const bookingSlot = await BookingSlot.findOne({ _id: slotId, vendorId });
    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found",
      });
    }

    // Get reservation
    const reservation = await Reservation.findOne({
      _id: reservationId,
      bookingSlotId: slotId,
      vendorId,
    });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    // Validation: Can't cancel if already completed
    if (reservation.status === "confirmed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a confirmed reservation",
      });
    }

    // If already cancelled, just return
    if (reservation.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Reservation is already cancelled",
      });
    }

    // Update reservation
    reservation.status = "cancelled";
    reservation.cancelledAt = new Date();
    reservation.cancelledBy = "vendor";
    if (cancellationReason) {
      reservation.cancellationReason = cancellationReason;
    }
    await reservation.save();

    // Decrement booking slot totalBookings to free up capacity
    if (reservation.status !== "pending") {
      bookingSlot.totalBookings = Math.max(0, bookingSlot.totalBookings - 1);
      await bookingSlot.save();
    }

    // Populate response
    await reservation.populate("tableId", "tableNumber seatingCapacity");
    await reservation.populate("sectionId", "sectionName");

    res.status(200).json({
      success: true,
      message: "Reservation cancelled successfully",
      data: reservation,
    });
  } catch (error) {
    console.error("Cancel reservation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Create recurring booking slots (NEW DYNAMIC APPROACH)
export const createRecurringBookingSlot = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const {
      slotName,
      slotType,
      startTime,
      endTime,
      sectionId,
      description,
      maxBookings,
      recurrence,
      rangeStart,
      rangeEnd,
    } = req.body;

    // Basic validation
    if (!slotName || !slotType || !startTime || !endTime || !sectionId) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: slotName, slotType, startTime, endTime, sectionId",
      });
    }

    if (!recurrence || !recurrence.type) {
      return res.status(400).json({
        success: false,
        message: "recurrence object with a valid type is required",
      });
    }

    if (!rangeStart) {
      return res.status(400).json({
        success: false,
        message: "rangeStart is required for recurring slots",
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time",
      });
    }

    // rangeStart must not be in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(rangeStart) < today) {
      return res.status(400).json({
        success: false,
        message: "rangeStart cannot be in the past",
      });
    }

    // If rangeEnd provided, enforce max 2 year look-ahead
    if (rangeEnd) {
      const maxEnd = new Date(today);
      maxEnd.setFullYear(maxEnd.getFullYear() + 2);
      if (new Date(rangeEnd) > maxEnd) {
        return res.status(400).json({
          success: false,
          message: "rangeEnd cannot be more than 2 years in the future",
        });
      }
    }

    // Section check
    const section = await Section.findOne({
      _id: sectionId,
      vendorId,
      isActive: true,
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found or inactive",
      });
    }

    // Validate recurrence rule by generating test occurrences
    try {
      const testEnd =
        rangeEnd ||
        new Date(
          new Date(rangeStart).setMonth(new Date(rangeStart).getMonth() + 1),
        );
      const testDates = generateOccurrences(recurrence, rangeStart, testEnd);

      if (testDates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "The recurrence rule produces no valid dates",
        });
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: `Invalid recurrence rule: ${err.message}`,
      });
    }

    // Create ONE slot definition with dateRange
    const bookingSlot = await BookingSlot.create({
      vendorId,
      slotName,
      slotType,
      startTime,
      endTime,
      sectionId,
      description: description || "",
      maxBookings: maxBookings || null,
      isActive: true,
      isRecurring: true,
      recurrenceRule: recurrence,
      dateRange: {
        start: new Date(rangeStart),
        end: rangeEnd ? new Date(rangeEnd) : null, // null = indefinite
      },
    });

    // Populate section info
    const populatedSlot = await BookingSlot.findById(bookingSlot._id).populate(
      "sectionId",
      "sectionName sectionType",
    );

    // Generate public link
    const publicLink = populatedSlot.getPublicLink();

    console.log(`[Recurring] Created dynamic slot: ${populatedSlot._id}`);

    return res.status(201).json({
      success: true,
      message: "Recurring booking slot created successfully (dynamic)",
      data: {
        bookingSlot: populatedSlot,
        publicLink: publicLink,
        publicToken: populatedSlot.publicToken,
        recurrenceRule: recurrence,
        dateRange: {
          start: rangeStart,
          end: rangeEnd || "indefinite",
        },
      },
    });
  } catch (error) {
    console.error("Create recurring booking slots error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete all recurring slots related to one group
export const deleteRecurringSeries = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { groupId } = req.params;
    const { scope, fromDate } = req.query;

    if (!groupId || groupId === "undefined") {
      return res.status(400).json({
        success: false,
        message: "recurrenceGroupId is required",
      });
    }

    if (!scope || !["all", "from_date"].includes(scope)) {
      return res.status(400).json({
        success: false,
        message: 'scope query param must be "all" or "from_date"',
      });
    }

    if (scope === "from_date" && !fromDate) {
      return res.status(400).json({
        success: false,
        message: "fromDate query param is required when scope is from_date",
      });
    }

    const baseFilter = {
      recurrenceGroupId: groupId, // must match exact group
      vendorId, // must belong to this vendor
      isRecurring: true, // must be a recurring slot (extra safety)
    };

    // Verify the group actually exists and belongs to this vendor
    const anySlot = await BookingSlot.findOne(baseFilter);
    if (!anySlot) {
      return res.status(404).json({
        success: false,
        message: "Recurrence group not found or does not belong to you",
      });
    }

    // Build final filter — only add date constraint for from_date scope
    const filter = { ...baseFilter };
    if (scope === "from_date") {
      filter.date = { $gte: new Date(fromDate) };
    }

    // Block deletion if any matched slot has bookings
    const bookedSlots = await BookingSlot.find({
      ...filter,
      totalBookings: { $gt: 0 },
    }).select("_id slotName date totalBookings");

    if (bookedSlots.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${bookedSlots.length} slot(s) have existing bookings and cannot be deleted. Cancel those reservations first or deactivate the slots instead.`,
        data: { blockedSlots: bookedSlots },
      });
    }

    // Safe to delete
    const result = await BookingSlot.deleteMany(filter);

    console.log(
      `[Recurring] Group ${groupId}: ${result.deletedCount} slots deleted (scope: ${scope})`,
    );

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} slot(s) deleted successfully`,
      data: {
        recurrenceGroupId: groupId,
        scope,
        deletedCount: result.deletedCount,
      },
    });
  } catch (error) {
    console.error("Delete recurring series error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get available dates for a recurring slot (PUBLIC - for customers)
export const getAvailableDatesForSlot = async (req, res) => {
  try {
    const { token } = req.params;
    const { lookAhead } = req.query; // Optional: days to look ahead (default 90)

    const bookingSlot = await BookingSlot.findOne({
      publicToken: token,
      isActive: true,
    });

    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found or inactive",
      });
    }

    // For non-recurring slots, return the single date
    if (!bookingSlot.isRecurring) {
      return res.status(200).json({
        success: true,
        isRecurring: false,
        availableDates: [bookingSlot.date],
      });
    }

    // For recurring slots, generate dates dynamically
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rangeStart =
      toLocalDateStr(new Date(bookingSlot.dateRange.start)) >
      toLocalDateStr(today)
        ? new Date(bookingSlot.dateRange.start)
        : today;

    // Determine end date
    const daysAhead = parseInt(lookAhead) || 90; // Default 90 days
    const defaultEnd = new Date(today);
    defaultEnd.setDate(defaultEnd.getDate() + daysAhead);

    let rangeEnd;
    if (bookingSlot.dateRange.end) {
      // Use the earlier of slot end or lookAhead
      rangeEnd =
        toLocalDateStr(new Date(bookingSlot.dateRange.end)) <
        toLocalDateStr(defaultEnd)
          ? new Date(bookingSlot.dateRange.end)
          : defaultEnd;
    } else {
      rangeEnd = defaultEnd;
    }

    // Generate available dates
    let availableDates;
    try {
      const allDates = generateOccurrences(
        bookingSlot.recurrenceRule,
        rangeStart,
        rangeEnd,
      );

      // Filter out excluded dates
      const nonExcluded = allDates.filter((date) => {
        const dateStr = toLocalDateStr(date);
        return !bookingSlot.excludedDates.some(
          (excluded) => toLocalDateStr(excluded) === dateStr,
        );
      });

      // Filter out fully-booked dates when maxBookings is set
      if (bookingSlot.maxBookings !== null && nonExcluded.length > 0) {
        // Batch-count bookings per day in a single aggregation query
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
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$reservationDate" },
              },
              count: { $sum: 1 },
            },
          },
        ]);

        const fullyBooked = new Set(
          bookingCounts
            .filter((r) => r.count >= bookingSlot.maxBookings)
            .map((r) => r._id),
        );

        availableDates = nonExcluded.filter(
          (d) => !fullyBooked.has(toLocalDateStr(d)),
        );
      } else {
        // No maxBookings cap, or nothing to check — all non-excluded dates are available
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
    console.error("Get available dates error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Check if specific date is valid for recurring slot (VALIDATION HELPER)
export const validateSlotDate = async (req, res) => {
  try {
    const { token } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date query parameter is required (format: YYYY-MM-DD)",
      });
    }

    const bookingSlot = await BookingSlot.findOne({
      publicToken: token,
      isActive: true,
    });

    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found or inactive",
      });
    }

    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    // For non-recurring slots
    if (!bookingSlot.isRecurring) {
      const slotDate = new Date(bookingSlot.date);
      slotDate.setHours(0, 0, 0, 0);

      const isValid = selectedDate.getTime() === slotDate.getTime();

      return res.status(200).json({
        success: true,
        isValid,
        message: isValid ? "Date is valid" : "Date does not match slot date",
      });
    }

    // For recurring slots
    // Check if date is within range
    if (
      toLocalDateStr(selectedDate) <
      toLocalDateStr(new Date(bookingSlot.dateRange.start))
    ) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: "Date is before slot start date",
      });
    }

    if (
      bookingSlot.dateRange.end &&
      toLocalDateStr(selectedDate) >
        toLocalDateStr(new Date(bookingSlot.dateRange.end))
    ) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: "Date is after slot end date",
      });
    }

    // Check if date is in excluded dates
    const dateStr = toLocalDateStr(selectedDate);
    const isExcluded = bookingSlot.excludedDates.some(
      (excluded) => toLocalDateStr(excluded) === dateStr,
    );

    if (isExcluded) {
      return res.status(200).json({
        success: true,
        isValid: false,
        message: "Date is excluded (blackout date)",
      });
    }

    // Check if date matches recurrence pattern
    try {
      const testEnd = new Date(selectedDate);
      testEnd.setDate(testEnd.getDate() + 1);

      const validDates = generateOccurrences(
        bookingSlot.recurrenceRule,
        selectedDate,
        testEnd,
      );

      const isValid = validDates.some((d) => {
        const vd = new Date(d);
        vd.setHours(0, 0, 0, 0);
        return vd.getTime() === selectedDate.getTime();
      });

      return res.status(200).json({
        success: true,
        isValid,
        message: isValid
          ? "Date is valid for this recurring slot"
          : "Date does not match recurrence pattern",
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: `Error validating date: ${err.message}`,
      });
    }
  } catch (error) {
    console.error("Validate slot date error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get today's reservations for the vendor (Sri Lanka time, UTC+5:30)
export const getTodayReservations = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { status } = req.query;

    // Sri Lanka is UTC+5:30. To compute "today" in LKT we shift the current UTC
    // time forward by the offset, then extract the calendar date, then build UTC
    // range boundaries that correspond to LKT midnight → LKT midnight+24h.
    const LKT_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes

    const nowUTC = Date.now();
    const nowLKT = new Date(nowUTC + LKT_OFFSET_MS);

    // Midnight of today in LKT, expressed as a UTC Date
    const todayStartUTC = new Date(
      Date.UTC(
        nowLKT.getUTCFullYear(),
        nowLKT.getUTCMonth(),
        nowLKT.getUTCDate(),
      ) - LKT_OFFSET_MS,
    );
    const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);

    const query = {
      vendorId,
      reservationDate: { $gte: todayStartUTC, $lt: todayEndUTC },
    };

    if (status) {
      query.status = status;
    }

    const reservations = await Reservation.find(query)
      .populate("tableId", "tableNumber seatingCapacity")
      .populate("sectionId", "sectionName")
      .populate("bookingSlotId", "slotName")
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      count: reservations.length,
      date: todayStartUTC.toISOString().split("T")[0],
      data: reservations,
    });
  } catch (error) {
    console.error("Get today reservations error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
