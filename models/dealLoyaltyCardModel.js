import mongoose from "mongoose";

// Tracks one customer's stamp progress toward a loyalty deal's reward.
// Each qualifying visit adds a stamp; crossing loyaltyConfig.stampsRequired
// resets the counter and mints a single-use DealClaim reward token that
// staff redeem exactly like a voucher via POST /api/vendor/deals/redeem.
const dealLoyaltyCardSchema = new mongoose.Schema(
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
    // Firebase uid of the customer this card belongs to
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Persistent code the customer presents at each visit to be stamped —
    // unlike a voucher code, this is reused across the card's whole lifetime
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    // Progress toward the next reward (0 .. stampsRequired - 1)
    stampCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Lifetime counters for analytics — never decremented
    totalStampsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    rewardsIssuedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastStampAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// One loyalty card per customer per deal
dealLoyaltyCardSchema.index({ dealId: 1, userId: 1 }, { unique: true });
dealLoyaltyCardSchema.index({ vendorId: 1, createdAt: -1 });

const DealLoyaltyCard = mongoose.model("DealLoyaltyCard", dealLoyaltyCardSchema);

export default DealLoyaltyCard;
