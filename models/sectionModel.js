import mongoose from "mongoose";

const sectionSchema = mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    sectionName: {
      type: String,
      required: [true, "Section name is required"],
      trim: true,
    },

    sectionType: {
      type: String,
      enum: ["indoor", "outdoor", "vip", "rooftop", "other"],
      default: "indoor",
    },

    description: {
      type: String,
      trim: true,
      maxLength: [500, "Description cannot exceed 500 characters"],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Compound index for vendor + section name uniqueness
sectionSchema.index({ vendorId: 1, sectionName: 1 }, { unique: true });

// Index for active sections
sectionSchema.index({ vendorId: 1, isActive: 1 });

const Section = mongoose.model("Section", sectionSchema);
export default Section;
