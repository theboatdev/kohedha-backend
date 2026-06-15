import mongoose from "mongoose";
import crypto from "crypto";

const reservationSchema = mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    // Link to booking slot (if booked via public link)
    bookingSlotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookingSlot",
      index: true,
      default: null,
    },

    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true,
      index: true,
    },

    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      required: true,
      index: true,
    },

    // Customer Information
    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },

    numberOfGuests: {
      type: Number,
      required: true,
      min: [1, "At least 1 guest required"],
    },

    // Date and Time
    reservationDate: {
      type: Date,
      required: true,
      index: true,
    },

    startTime: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
        },
        message: "Invalid time format. Use HH:mm (24-hour format)",
      },
    },

    endTime: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
        },
        message: "Invalid time format. Use HH:mm (24-hour format)",
      },
    },

    // Status Management
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
      index: true,
    },

    // Cancellation Details
    cancellationReason: {
      type: String,
      trim: true,
    },

    cancelledAt: {
      type: Date,
    },

    cancelledBy: {
      type: String,
      enum: ["customer", "vendor"],
    },

    // Confirmation
    confirmedAt: {
      type: Date,
    },

    // Who created the reservation
    createdBy: {
      type: String,
      enum: ["customer", "vendor"],
      default: "customer",
    },

    // Customer confirmation token (to view their booking)
    confirmationToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Generate confirmation token before saving
reservationSchema.pre("save", function () {
  if (this.isNew && !this.confirmationToken) {
    this.confirmationToken = crypto.randomBytes(16).toString("hex");
  }
});

// Method to generate customer confirmation link
reservationSchema.methods.getConfirmationLink = function () {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/my-reservation/${this.confirmationToken}`;
};

// Indexes
reservationSchema.index({ vendorId: 1, reservationDate: 1, status: 1 });

const Reservation = mongoose.model("Reservation", reservationSchema);
export default Reservation;
