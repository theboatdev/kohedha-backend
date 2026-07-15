import mongoose from "mongoose";

const rallySubmissionSchema = new mongoose.Schema(
  {
    location: {
      type: Number,
      required: true,
      enum: [1, 2, 3],
      index: true,
    },

    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deal",
      required: true,
    },

    driverId: {
      type: String,
      required: [true, "Driver ID is required"],
      trim: true,
    },

    driverName: {
      type: String,
      required: [true, "Driver name is required"],
      trim: true,
    },

    question: {
      type: String,
      required: true,
      trim: true,
    },

    answer: {
      type: String,
      required: [true, "Answer is required"],
      trim: true,
    },

    // Firebase UID of the mobile user who submitted
    submittedBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

rallySubmissionSchema.index({ location: 1, driverId: 1 });
rallySubmissionSchema.index({ dealId: 1 });

const RallySubmission = mongoose.model("RallySubmission", rallySubmissionSchema);

export default RallySubmission;
