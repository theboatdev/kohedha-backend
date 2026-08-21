import mongoose from "mongoose";

const dealSchema = mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    dealName: {
      type: String,
      required: [true, "Please provide a deal name"],
      trim: true,
      maxlength: [150, "Deal name cannot exceed 150 characters"],
    },

    description: {
      type: String,
      required: [true, "Please provide a deal description"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },

    category: {
      type: String,
      enum: [
        "food-beverage",
        "entertainment",
        "accommodation",
        "wellness-spa",
        "shopping",
        "travel-adventure",
        "dining-experience",
        "events",
        "other",
      ],
      required: [true, "Please provide a deal category"],
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [5000, "Notes cannot exceed 5000 characters"],
    },

    images: [
      {
        url: {
          type: String,
          required: true,
        },
        alt: {
          type: String,
          trim: true,
        },
        caption: {
          type: String,
          trim: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    mainImage: {
      url: {
        type: String,
      },
    },

    socialLinks: {
      facebook: {
        type: String,
        trim: true,
      },
      instagram: {
        type: String,
        trim: true,
      },
      twitter: {
        type: String,
        trim: true,
      },
      website: {
        type: String,
        trim: true,
      },
    },

    contactInfo: {
      phone: {
        type: String,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
    },

    dealType: {
      type: String,
      enum: ["ambient", "voucher", "limited-quantity", "loyalty"],
      default: "ambient",
    },

    // Only used when dealType === "ambient"
    activeWindow: {
      daysOfWeek: {
        type: [Number], // 0=Sun … 6=Sat, matches JS Date#getDay() convention
        default: [],
        validate: {
          validator: (arr) => arr.every((d) => d >= 0 && d <= 6),
          message: "daysOfWeek must contain values 0–6",
        },
      },
      startTime: {
        type: String,
        validate: {
          validator: (v) => !v || /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
          message: "Invalid time format. Use HH:mm (24-hour)",
        },
      },
      endTime: {
        type: String,
        validate: {
          validator: (v) => !v || /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
          message: "Invalid time format. Use HH:mm (24-hour)",
        },
      },
    },

    // Only used when dealType === "voucher"
    voucherConfig: {
      // How long a claimed voucher stays valid before auto-expiring, if unused
      claimExpiryMinutes: {
        type: Number,
        min: [5, "Claim expiry must be at least 5 minutes"],
        max: [10080, "Claim expiry cannot exceed 7 days"],
        default: 120,
      },
      // Short label shown to staff/customers, e.g. "BOGO", "Free Appetizer", "20% off"
      rewardLabel: {
        type: String,
        trim: true,
        maxlength: [100, "Reward label cannot exceed 100 characters"],
      },
    },

    // Only used when dealType === "limited-quantity"
    limitedQuantityConfig: {
      // Total number of slots this deal was created with (fixed at creation)
      totalQuantity: {
        type: Number,
        min: [1, "Total quantity must be at least 1"],
      },
      // Live counter — decremented on claim, incremented back on expire/cancel
      remainingQuantity: {
        type: Number,
        min: [0, "Remaining quantity cannot be negative"],
      },
      // How long a claimed slot stays held before its reservation auto-releases
      claimExpiryMinutes: {
        type: Number,
        min: [5, "Claim expiry must be at least 5 minutes"],
        max: [10080, "Claim expiry cannot exceed 7 days"],
        default: 30,
      },
      // Short label shown to staff/customers, e.g. "First 50 customers"
      rewardLabel: {
        type: String,
        trim: true,
        maxlength: [100, "Reward label cannot exceed 100 characters"],
      },
    },

    // Only used when dealType === "loyalty"
    loyaltyConfig: {
      // Stamps a customer must collect before a reward token is minted,
      // e.g. "buy 9, get the 10th free" -> stampsRequired = 9
      stampsRequired: {
        type: Number,
        min: [2, "Stamps required must be at least 2"],
        max: [100, "Stamps required cannot exceed 100"],
        default: 9,
      },
      // How long a minted reward token stays valid before auto-expiring, if unused
      claimExpiryMinutes: {
        type: Number,
        min: [5, "Claim expiry must be at least 5 minutes"],
        max: [10080, "Claim expiry cannot exceed 7 days"],
        default: 10080,
      },
      // Short label shown to staff/customers, e.g. "Buy 9, get the 10th free"
      rewardLabel: {
        type: String,
        trim: true,
        maxlength: [100, "Reward label cannot exceed 100 characters"],
      },
    },

    status: {
      type: String,
      enum: ["active", "expired", "coming-soon", "paused", "sold-out"],
      default: "active",
      required: true,
    },

    priority: {
      type: Number,
      min: [1, "Priority must be at least 1"],
      max: [10, "Priority cannot exceed 10"],
      default: 5,
    },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    startDate: {
      type: Date,
    },

    endDate: {
      type: Date,
    },

    publishedAt: {
      type: Date,
    },

    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Indexes for better query performance
dealSchema.index({ vendorId: 1, status: 1 });
dealSchema.index({ vendorId: 1, isPublished: 1 });
dealSchema.index({ vendorId: 1, category: 1, status: 1 });
dealSchema.index({ category: 1, status: 1 });
dealSchema.index({ status: 1, isPublished: 1 });
dealSchema.index({ priority: 1, status: 1 });
dealSchema.index({ tags: 1 });
dealSchema.index({ publishedAt: -1 });

const Deal = mongoose.model("Deal", dealSchema);

export default Deal;
