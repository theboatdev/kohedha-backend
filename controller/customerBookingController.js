import BookingSlot from "../models/bookingSlotModel.js";
import Reservation from "../models/reservationModel.js";
import Table from "../models/tableModel.js";
import Section from "../models/sectionModel.js";
import Vendor from "../models/vendorModel.js";

// Convert a Date to a YYYY-MM-DD string using LOCAL time (avoids UTC day-shift in non-UTC timezones)
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Get booking slot details (no auth)
export const getPublicBookingSlot = async (req, res) => {
  try {
    const { token } = req.params;

    const bookingSlot = await BookingSlot.findOne({
      publicToken: token,
      isActive: true,
    })
      .populate("sectionId", "sectionName sectionType description")
      .populate(
        "vendorId",
        "companyName location.businessName location.city location.streetAddress vendorMobile",
      );

    if (!bookingSlot) {
      return res.status(404).json({
        success: false,
        message: "Booking slot not found or inactive",
      });
    }

    // For single-date slots: check if the date has passed
    if (!bookingSlot.isRecurring) {
      const slotDate = new Date(bookingSlot.date);
      slotDate.setHours(23, 59, 59, 999);
      if (slotDate < new Date()) {
        return res.status(410).json({
          success: false,
          message: "This booking slot has expired",
        });
      }
    }

    // For recurring slots: check if the series end date has passed
    if (bookingSlot.isRecurring && bookingSlot.dateRange?.end) {
      const endDate = new Date(bookingSlot.dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      if (endDate < new Date()) {
        return res.status(410).json({
          success: false,
          message: "This booking slot series has ended",
        });
      }
    }

    // Get all tables in this section
    const tables = await Table.find({
      vendorId: bookingSlot.vendorId,
      sectionId: bookingSlot.sectionId,
      isActive: true,
    }).select("tableNumber seatingCapacity shape");

    // For single-date slots: check max bookings via totalBookings counter.
    // For recurring slots: availability is per-day and enforced at booking time,
    // so report true here (the date picker filters fully-booked days separately).
    let spotsAvailable;
    if (bookingSlot.isRecurring) {
      spotsAvailable = true; // per-day enforcement happens in createPublicReservation
    } else {
      spotsAvailable =
        bookingSlot.maxBookings === null ||
        (bookingSlot.totalBookings || 0) < bookingSlot.maxBookings;
    }

    res.status(200).json({
      success: true,
      data: {
        slotId: bookingSlot._id,
        slotName: bookingSlot.slotName,
        slotType: bookingSlot.slotType,
        description: bookingSlot.description,
        isRecurring: bookingSlot.isRecurring || false,
        // Single-date slots
        date: bookingSlot.date || null,
        // Recurring slots
        dateRange: bookingSlot.dateRange || null,
        recurrenceRule: bookingSlot.recurrenceRule || null,
        excludedDates: bookingSlot.excludedDates || [],
        timeWindow: {
          start: bookingSlot.startTime,
          end: bookingSlot.endTime,
        },
        section: {
          id: bookingSlot.sectionId._id,
          name: bookingSlot.sectionId.sectionName,
          type: bookingSlot.sectionId.sectionType,
        },
        vendor: {
          name:
            bookingSlot.vendorId.companyName ||
            bookingSlot.vendorId.location?.businessName,
          city: bookingSlot.vendorId.location?.city,
          address: bookingSlot.vendorId.location?.streetAddress,
          phone: bookingSlot.vendorId.vendorMobile,
        },
        totalTables: tables.length,
        totalBookings: bookingSlot.totalBookings || 0,
        maxBookings: bookingSlot.maxBookings,
        spotsAvailable: spotsAvailable,
      },
    });
  } catch (error) {
    console.error("Get public booking slot error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get available tables for specific times
export const getAvailableTablesForSlot = async (req, res) => {
  try {
    const { token } = req.params;
    const { startTime, endTime, numberOfGuests, date } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Start time and end time are required",
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

    // Validate that requested time is within slot's time window
    if (startTime < bookingSlot.startTime || endTime > bookingSlot.endTime) {
      return res.status(400).json({
        success: false,
        message: `Time must be within ${bookingSlot.startTime} - ${bookingSlot.endTime}`,
      });
    }

    // Get all tables in the section
    let tableFilter = {
      vendorId: bookingSlot.vendorId,
      sectionId: bookingSlot.sectionId,
      isActive: true,
    };

    // Filter by capacity if provided
    if (numberOfGuests) {
      tableFilter.seatingCapacity = { $gte: parseInt(numberOfGuests) };
    }

    const allTables = await Table.find(tableFilter).sort({ tableNumber: 1 });

    // Get existing reservations for this date and overlapping time
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

    // Get IDs of booked tables
    const bookedTableIds = existingReservations.map((res) =>
      res.tableId.toString(),
    );

    // Filter available tables
    const availableTables = allTables.filter(
      (table) => !bookedTableIds.includes(table._id.toString()),
    );

    res.status(200).json({
      success: true,
      count: availableTables.length,
      data: availableTables,
      checkedDate: toLocalDateStr(checkDate),
    });
  } catch (error) {
    console.error("Get available tables error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Create reservation via public link
export const createPublicReservation = async (req, res) => {
  try {
    const { token } = req.params;
    const {
      tableId,
      customerName,
      customerPhone,
      numberOfGuests,
      startTime,
      endTime,
      reservationDate, // NEW: Customer selects date for recurring slots
    } = req.body;

    // Validation
    if (
      !tableId ||
      !customerName ||
      !customerPhone ||
      !numberOfGuests ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Get booking slot
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

    // Determine the reservation date
    let actualReservationDate;

    if (bookingSlot.isRecurring) {
      // For recurring slots, customer must provide date
      if (!reservationDate) {
        return res.status(400).json({
          success: false,
          message: "reservationDate is required for recurring slots",
        });
      }

      actualReservationDate = new Date(reservationDate);
      actualReservationDate.setHours(0, 0, 0, 0);

      // Validate date is within slot range (compare as local date strings to avoid UTC offset issues)
      if (
        toLocalDateStr(actualReservationDate) <
        toLocalDateStr(new Date(bookingSlot.dateRange.start))
      ) {
        return res.status(400).json({
          success: false,
          message: "Selected date is before slot start date",
        });
      }

      if (
        bookingSlot.dateRange.end &&
        toLocalDateStr(actualReservationDate) >
          toLocalDateStr(new Date(bookingSlot.dateRange.end))
      ) {
        return res.status(400).json({
          success: false,
          message: "Selected date is after slot end date",
        });
      }

      // Validate date matches recurrence pattern
      const { generateOccurrences } =
        await import("../utils/recurrenceUtils.js");
      const testEnd = new Date(actualReservationDate);
      testEnd.setDate(testEnd.getDate() + 1);

      const validDates = generateOccurrences(
        bookingSlot.recurrenceRule,
        actualReservationDate,
        testEnd,
      );

      const isValidDate = validDates.some((d) => {
        const vd = new Date(d);
        vd.setHours(0, 0, 0, 0);
        return vd.getTime() === actualReservationDate.getTime();
      });

      if (!isValidDate) {
        return res.status(400).json({
          success: false,
          message: "Selected date does not match recurrence pattern",
        });
      }

      // Check if date is excluded
      const dateStr = toLocalDateStr(actualReservationDate);
      const isExcluded = bookingSlot.excludedDates.some(
        (excluded) => toLocalDateStr(excluded) === dateStr,
      );

      if (isExcluded) {
        return res.status(400).json({
          success: false,
          message: "Selected date is not available (blackout date)",
        });
      }
    } else {
      // For single-date slots, use slot's date
      actualReservationDate = new Date(bookingSlot.date);
      actualReservationDate.setHours(0, 0, 0, 0);
    }

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (actualReservationDate < today) {
      return res.status(410).json({
        success: false,
        message: "Cannot book for past dates",
      });
    }

    // Check max bookings for this specific date (for recurring slots)
    if (bookingSlot.maxBookings !== null) {
      const startOfDay = new Date(actualReservationDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(actualReservationDate);
      endOfDay.setHours(23, 59, 59, 999);

      const bookingsCount = await Reservation.countDocuments({
        bookingSlotId: bookingSlot._id,
        reservationDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ["pending", "confirmed"] },
      });

      if (bookingsCount >= bookingSlot.maxBookings) {
        return res.status(400).json({
          success: false,
          message: "This date is fully booked",
        });
      }
    }

    // Validate time is within slot window
    if (startTime < bookingSlot.startTime || endTime > bookingSlot.endTime) {
      return res.status(400).json({
        success: false,
        message: `Time must be within ${bookingSlot.startTime} - ${bookingSlot.endTime}`,
      });
    }

    // Verify table exists and belongs to the section
    const table = await Table.findOne({
      _id: tableId,
      vendorId: bookingSlot.vendorId,
      sectionId: bookingSlot.sectionId,
      isActive: true,
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found in this section",
      });
    }

    // Check table capacity
    if (numberOfGuests > table.seatingCapacity) {
      return res.status(400).json({
        success: false,
        message: `This table seats ${table.seatingCapacity} guests maximum`,
      });
    }

    // Check table availability for the selected date
    const startOfDay = new Date(actualReservationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(actualReservationDate);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingReservation = await Reservation.findOne({
      tableId,
      reservationDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ["pending", "confirmed"] },
      $or: [
        { startTime: { $lte: startTime }, endTime: { $gt: startTime } },
        { startTime: { $lt: endTime }, endTime: { $gte: endTime } },
        { startTime: { $gte: startTime }, endTime: { $lte: endTime } },
      ],
    });

    if (conflictingReservation) {
      return res.status(409).json({
        success: false,
        message: "This table is already booked for the selected time",
      });
    }

    // Create reservation
    const reservation = await Reservation.create({
      bookingSlotId: bookingSlot._id,
      vendorId: bookingSlot.vendorId,
      tableId,
      sectionId: bookingSlot.sectionId,
      customerName,
      customerPhone,
      numberOfGuests,
      reservationDate: actualReservationDate,
      startTime,
      endTime,
      status: "pending",
      createdBy: "customer",
    });

    // Increment booking counter (only for legacy single-date slots)
    if (!bookingSlot.isRecurring && bookingSlot.totalBookings !== undefined) {
      bookingSlot.totalBookings += 1;
      await bookingSlot.save();
    }

    // Populate details
    const populatedReservation = await Reservation.findById(reservation._id)
      .populate("tableId", "tableNumber seatingCapacity")
      .populate("sectionId", "sectionName sectionType")
      .populate(
        "vendorId",
        "companyName location.businessName location.city location.streetAddress vendorMobile",
      );

    // Generate confirmation link
    const confirmationLink = populatedReservation.getConfirmationLink();

    res.status(201).json({
      success: true,
      message: "Reservation created successfully!",
      data: {
        reservation: populatedReservation,
        confirmationLink: confirmationLink,
        confirmationToken: populatedReservation.confirmationToken,
      },
    });
  } catch (error) {
    console.error("Create public reservation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get reservation by confirmation token
export const getReservationByToken = async (req, res) => {
  try {
    const { token } = req.params;

    const reservation = await Reservation.findOne({
      confirmationToken: token,
    })
      .populate("tableId", "tableNumber seatingCapacity")
      .populate("sectionId", "sectionName sectionType")
      .populate(
        "vendorId",
        "companyName location.businessName location.city location.streetAddress vendorMobile",
      )
      .populate("bookingSlotId", "slotName slotType description");

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    res.status(200).json({
      success: true,
      data: reservation,
    });
  } catch (error) {
    console.error("Get reservation by token error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Cancel reservation by customer
export const cancelPublicReservation = async (req, res) => {
  try {
    const { token } = req.params;
    const { cancellationReason } = req.body;

    const reservation = await Reservation.findOne({
      confirmationToken: token,
    }).populate("bookingSlotId");

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }

    if (reservation.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Reservation is already cancelled",
      });
    }

    if (reservation.status === "completed") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot cancel completed reservation, please contact the the location.",
      });
    }

    // Update reservation
    reservation.status = "cancelled";
    reservation.cancelledAt = new Date();
    reservation.cancelledBy = "customer";
    reservation.cancellationReason = cancellationReason || "";
    await reservation.save();

    // Decrement booking slot counter
    if (reservation.bookingSlotId) {
      const bookingSlot = await BookingSlot.findById(reservation.bookingSlotId);
      if (bookingSlot && bookingSlot.totalBookings > 0) {
        bookingSlot.totalBookings -= 1;
        await bookingSlot.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Reservation cancelled successfully",
      data: reservation,
    });
  } catch (error) {
    console.error("Cancel public reservation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
