import mongoose from "mongoose";

// Represents a single customer's claim on a single-use voucher deal.
// Lifecycle: claimed -> redeemed | expired | cancelled
const dealClaimSchema = new mongoose.Schema(
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
    // Firebase uid of the customer who claimed the voucher
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Short human-typeable code shown to the customer (e.g. "K7M2-9X4Q")
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["claimed", "redeemed", "expired", "cancelled"],
      default: "claimed",
      required: true,
      index: true,
    },
    claimedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    // Claim auto-expires if not redeemed by this time
    expiresAt: {
      type: Date,
      required: true,
    },
    redeemedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// A user should only have one live (claimed) voucher per deal at a time
dealClaimSchema.index({ dealId: 1, userId: 1, status: 1 });
dealClaimSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

const DealClaim = mongoose.model("DealClaim", dealClaimSchema);

export default DealClaim;
