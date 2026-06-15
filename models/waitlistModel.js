import mongoose from "mongoose";

const waitlistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@gmail\.com$/, "Please provide a valid Gmail address"],
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    userType: {
      type: String,
      enum: ["restaurant", "customer"],
      required: true,
    },
    businessName: {
      type: String,
      trim: true,
      default: null,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true },
);

waitlistSchema.index({ email: 1 }, { unique: true });

const Waitlist = mongoose.model("Waitlist", waitlistSchema);
export default Waitlist;
