import Deal from "../models/dealModel.js";
import DealClaim from "../models/dealClaimModel.js";

// Transitions a single claim from "claimed" -> "expired" and, if the parent
// deal is limited-quantity, releases its reserved slot back into stock.
// Guarded by a status filter on the update so concurrent callers (lazy
// settle in a list/redeem endpoint, plus the background sweeper) can never
// double-release the same slot.
export async function expireClaimAndRelease(claimId) {
  const claim = await DealClaim.findOneAndUpdate(
    { _id: claimId, status: "claimed" },
    { $set: { status: "expired" } },
    { new: true },
  );

  if (!claim) return null; // already settled by someone else, or not "claimed"

  const deal = await Deal.findOne({
    _id: claim.dealId,
    dealType: "limited-quantity",
  }).select("status limitedQuantityConfig");

  if (deal) {
    const update = {
      $inc: { "limitedQuantityConfig.remainingQuantity": 1 },
    };
    // Reopen the deal if it was only sold-out because of held (not yet
    // expired) claims — don't clobber a deal a vendor manually paused/ended.
    if (deal.status === "sold-out") {
      update.$set = { status: "active" };
    }
    await Deal.updateOne({ _id: deal._id }, update);
  }

  return claim;
}

// Finds and expires/releases any "claimed" DealClaims whose hold window has
// passed. Safe to call repeatedly/concurrently (e.g. from a periodic sweeper
// and from lazy settle-on-read paths) thanks to the status guard above.
export async function sweepExpiredClaims() {
  const staleClaims = await DealClaim.find({
    status: "claimed",
    expiresAt: { $lt: new Date() },
  }).select("_id");

  let releasedCount = 0;
  for (const { _id } of staleClaims) {
    const released = await expireClaimAndRelease(_id);
    if (released) releasedCount += 1;
  }
  return releasedCount;
}
