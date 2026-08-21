import Deal from "../models/dealModel.js";
import DealClaim from "../models/dealClaimModel.js";
import DealLoyaltyCard from "../models/dealLoyaltyCardModel.js";
import { generateUniqueVoucherCode } from "../utils/voucherCodeUtils.js";

// POST /api/vendor/deals/loyalty/stamp
// Staff-side: adds one stamp to a customer's loyalty card by its code.
// If this stamp crosses the deal's stampsRequired threshold, mints a
// single-use DealClaim reward token — from that point on it behaves exactly
// like a voucher, redeemed via the existing POST /api/vendor/deals/redeem.
export const recordLoyaltyStamp = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please provide a loyalty card code",
      });
    }

    const normalizedCode = code.trim().toUpperCase();

    const card = await DealLoyaltyCard.findOne({
      code: normalizedCode,
      vendorId: req.vendor.id,
    }).populate({
      path: "dealId",
      select: "dealName dealType status isPublished loyaltyConfig",
    });

    if (!card) {
      console.warn(
        `[Loyalty Stamp] Code not found for vendor ${req.vendor.id}: ${normalizedCode}`,
      );
      return res.status(404).json({
        success: false,
        message: "Loyalty card not found for your venue",
      });
    }

    const deal = card.dealId;
    if (!deal || deal.dealType !== "loyalty") {
      return res.status(400).json({
        success: false,
        message: "This card is not tied to a loyalty deal",
      });
    }

    const stampsRequired = deal.loyaltyConfig?.stampsRequired || 9;

    const stampedCard = await DealLoyaltyCard.findOneAndUpdate(
      { _id: card._id },
      {
        $inc: { stampCount: 1, totalStampsEarned: 1 },
        $set: { lastStampAt: new Date() },
      },
      { new: true },
    );

    // Only claim the reward if THIS update is the one crossing the
    // threshold — the filter re-checks the live document, so concurrent
    // stamp requests on the same card can never both mint a reward for one
    // crossing.
    const rewardedCard = await DealLoyaltyCard.findOneAndUpdate(
      { _id: card._id, stampCount: { $gte: stampsRequired } },
      { $inc: { stampCount: -stampsRequired, rewardsIssuedCount: 1 } },
      { new: true },
    );

    let rewardClaim = null;
    let finalCard = stampedCard;

    if (rewardedCard) {
      finalCard = rewardedCard;
      const claimExpiryMinutes = deal.loyaltyConfig?.claimExpiryMinutes || 10080;
      const rewardCode = await generateUniqueVoucherCode();

      rewardClaim = await DealClaim.create({
        dealId: deal._id,
        vendorId: req.vendor.id,
        userId: card.userId,
        code: rewardCode,
        expiresAt: new Date(Date.now() + claimExpiryMinutes * 60 * 1000),
      });

      console.log(
        `[Loyalty Stamp] Reward unlocked for user ${card.userId} on deal ${deal._id}: ${rewardCode}`,
      );
    }

    res.status(200).json({
      success: true,
      message: rewardClaim
        ? `Stamp added — reward unlocked! Reward code: ${rewardClaim.code}`
        : `Stamp added (${finalCard.stampCount}/${stampsRequired})`,
      data: {
        card: finalCard,
        stampsRequired,
        rewardClaim,
      },
    });
  } catch (error) {
    console.error("[Loyalty Stamp] Error recording stamp:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error recording loyalty stamp",
    });
  }
};

// GET /api/vendor/deals/:id/loyalty-cards
// Lists loyalty cards for a deal owned by this vendor (auditing/analytics).
export const getDealLoyaltyCards = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const deal = await Deal.findById(id).select("vendorId");
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found" });
    }

    if (deal.vendorId.toString() !== req.vendor.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view loyalty cards for this deal",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = { dealId: id };
    const total = await DealLoyaltyCard.countDocuments(filter);
    const cards = await DealLoyaltyCard.find(filter)
      .sort({ lastStampAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: cards,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Get Deal Loyalty Cards] Error fetching cards:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching loyalty cards",
    });
  }
};
