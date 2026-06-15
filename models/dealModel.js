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
