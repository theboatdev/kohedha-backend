import mongoose from "mongoose";
import crypto from "crypto";

const bookingSlotSchema = mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    slotName: {
      type: String,
      trim: true,
    },

    slotType: {
      type: String,
      trim: true,
      required: true,
    },

    // For single-date slots (legacy support)
    date: {
      type: Date,
      required: false,
    },

    // For recurring slots - date range
    dateRange: {
      start: {
        type: Date,
        required: false,
      },
      end: {
        type: Date,
        required: false, // null means indefinite
      },
    },

    startTime: {
      type: String,
      required: [true, "Start time is required"],
      validate: {
        validator: function (v) {
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
        },
        message: "Invalid time format. Use HH:mm (24-hour format)",
      },
    },

    endTime: {
      type: String,
      required: [true, "End time is required"],
      validate: {
        validator: function (v) {
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
        },
        message: "Invalid time format. Use HH:mm (24-hour format)",
      },
    },

    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      required: true,
    },

    publicToken: {
      type: String,
      unique: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    totalBookings: {
      type: Number,
      default: 0,
    },

    maxBookings: {
      type: Number,
      default: null,
    },

    // Recurrence fields
    isRecurring: {
      type: Boolean,
      default: false,
    },

    recurrenceRule: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Optional: blackout dates for recurring slots
    excludedDates: {
      type: [Date],
      default: [],
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

// Generate unique public token and validation
bookingSlotSchema.pre("save", async function () {
  // Generate token for new slots
  if (this.isNew && !this.publicToken) {
    this.publicToken = crypto.randomBytes(16).toString("hex");
  }

  // Validation: Must have either date OR dateRange.start
  if (!this.date && !this.dateRange?.start) {
    throw new Error("Either 'date' or 'dateRange.start' is required");
  }

  // Validation: If recurring, must have dateRange and recurrenceRule
  if (this.isRecurring) {
    if (!this.dateRange?.start) {
      throw new Error("Recurring slots must have a dateRange.start date");
    }
    if (!this.recurrenceRule) {
      throw new Error("Recurring slots must have a recurrenceRule");
    }
  }
});

// Generate public booking link
bookingSlotSchema.methods.getPublicLink = function () {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/book/${this.publicToken}`;
};

// Indexes
bookingSlotSchema.index({ vendorId: 1, date: 1, sectionId: 1 }); // Legacy single-date slots
bookingSlotSchema.index({ vendorId: 1, "dateRange.start": 1, sectionId: 1 }); // Recurring slots
bookingSlotSchema.index({ vendorId: 1, isActive: 1 });
bookingSlotSchema.index({ publicToken: 1 });
bookingSlotSchema.index({ isRecurring: 1 });

const BookingSlot = mongoose.model("BookingSlot", bookingSlotSchema);
export default BookingSlot;
