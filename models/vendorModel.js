import mongoose from "mongoose";

const vendorSchema = mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    profilePicture: {
      type: String,
    },

    isProfileComplete: {
      type: Boolean,
      default: false,
    },

    registrationStep: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },

    profileCompletedAt: {
      type: Date,
    },

    companyName: {
      type: String,
      trim: true,
    },

    businessRegistrationNo: {
      type: String,
      trim: true,
    },

    vendorMobile: {
      type: String,
      trim: true,
    },

    location: {
      businessName: {
        type: String,
        trim: true,
      },

      streetAddress: {
        type: String,
        trim: true,
      },

      city: {
        type: String,
        trim: true,
      },

      district: {
        type: String,
        trim: true,
      },

      postalCode: {
        type: String,
        trim: true,
      },

      country: {
        type: String,
        default: "Sri Lanka",
        trim: true,
      },

      coordinates: {
        lat: {
          type: Number,
        },
        lng: {
          type: Number,
        },
      },
    },

    businessCategory: {
      type: String,
      trim: true,
    },

    website: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

// Indexes
vendorSchema.index({ isProfileComplete: 1 });

const Vendor = mongoose.model("Vendor", vendorSchema);
export default Vendor;
