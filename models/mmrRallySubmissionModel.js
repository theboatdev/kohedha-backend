import mongoose from "mongoose";

const mmrRallySubmissionSchema = new mongoose.Schema(
  {
    location: {
      type: Number,
      required: true,
      index: true,
    },
    // Flexible per-location key/value store matching the location's field config.
    answers: {
      type: Map,
      of: String,
    },
    // Optional Cloudinary URLs uploaded at check-in.
    imageUrls: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

const MmrRallySubmission = mongoose.model(
  "MmrRallySubmission",
  mmrRallySubmissionSchema,
);

export default MmrRallySubmission;
