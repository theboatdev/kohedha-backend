import mongoose from "mongoose";

const dealTapSchema = new mongoose.Schema(
  {
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deal",
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    // Firebase uid of the tapping user (comes from firebaseAuth middleware)
    userId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

dealTapSchema.index({ dealId: 1, createdAt: -1 });

const DealTap = mongoose.model("DealTap", dealTapSchema);
export default DealTap;
