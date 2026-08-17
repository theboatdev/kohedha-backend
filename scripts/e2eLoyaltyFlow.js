/**
 * End-to-end checks for loyalty / stamp deals, calling the REAL exported
 * controller functions (not reimplementations) against the real MongoDB.
 *
 * Covers:
 *   - createDeal / updateDeal: loyaltyConfig parsing + sanitization
 *   - mobileController.enrollLoyaltyDeal: get-or-create card, non-loyalty guard
 *   - loyaltyController.recordLoyaltyStamp: stamping, threshold -> reward mint,
 *     wrong-vendor guard, missing/bad code guards, concurrent-stamp race safety
 *   - loyaltyController.getDealLoyaltyCards: vendor listing + ownership guard
 *   - mobileController.getMyLoyaltyCards: customer listing
 *   - dealController.redeemVoucherCode: reward token behaves like a voucher
 *
 * Creates temporary vendors/deals/cards/claims tagged with TEST_TAG and
 * deletes them afterwards.
 *
 * Usage (from backend/):
 *   node scripts/e2eLoyaltyFlow.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Vendor from "../models/vendorModel.js";
import Deal from "../models/dealModel.js";
import DealClaim from "../models/dealClaimModel.js";
import DealLoyaltyCard from "../models/dealLoyaltyCardModel.js";
import { createDeal, updateDeal, redeemVoucherCode } from "../controller/dealController.js";
import { recordLoyaltyStamp, getDealLoyaltyCards } from "../controller/loyaltyController.js";
import { enrollLoyaltyDeal, getMyLoyaltyCards } from "../controller/mobileController.js";

dotenv.config();

const TEST_TAG = `__e2e_loyalty_${Date.now()}__`;
const TEST_USER = `e2e-loyalty-user-${Date.now()}`;

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true });
  console.log(`PASS | ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ""}`);
}

// Minimal Express-like res double that captures status/json calls
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

async function call(fn, req) {
  const res = mockRes();
  await fn(req, res);
  return res;
}

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  const vendor = await Vendor.create({
    email: `e2e-loyalty-${Date.now()}@example.com`,
    password: "not-used-for-e2e",
    authProvider: "local",
    isProfileComplete: true,
    registrationStep: 3,
    companyName: `E2E Loyalty Vendor ${TEST_TAG}`,
  });

  const otherVendor = await Vendor.create({
    email: `e2e-loyalty-other-${Date.now()}@example.com`,
    password: "not-used-for-e2e",
    authProvider: "local",
    isProfileComplete: true,
    registrationStep: 3,
    companyName: `E2E Loyalty Other Vendor ${TEST_TAG}`,
  });

  // ---------- createDeal: loyaltyConfig parsing ----------
  const createReq = {
    vendor: { id: vendor._id.toString() },
    body: {
      dealName: `Loyalty e2e ${TEST_TAG}`,
      description: "Buy 9 get the 10th free",
      category: "other",
      dealType: "loyalty",
      status: "active",
      isPublished: true,
      tags: [TEST_TAG],
      loyaltyConfig: {
        stampsRequired: 3,
        claimExpiryMinutes: 10080,
        rewardLabel: "Free Coffee",
      },
    },
  };
  const createRes = await call(createDeal, createReq);

  createRes.statusCode === 201 && createRes.body?.success
    ? pass("createDeal (loyalty) returns 201")
    : fail("createDeal (loyalty) returns 201", JSON.stringify(createRes.body));

  const dealId = createRes.body?.data?._id;
  const createdCfg = createRes.body?.data?.loyaltyConfig;
  createdCfg?.stampsRequired === 3 &&
  createdCfg?.claimExpiryMinutes === 10080 &&
  createdCfg?.rewardLabel === "Free Coffee"
    ? pass("createDeal persists loyaltyConfig as given", JSON.stringify(createdCfg))
    : fail("createDeal persists loyaltyConfig as given", JSON.stringify(createdCfg));

  // ---------- createDeal: loyaltyConfig sanitization (out-of-range inputs) ----------
  const sanitizeReq = {
    vendor: { id: vendor._id.toString() },
    body: {
      dealName: `Loyalty sanitize e2e ${TEST_TAG}`,
      description: "invalid config should be clamped/defaulted, not rejected",
      category: "other",
      dealType: "loyalty",
      status: "active",
      isPublished: true,
      tags: [TEST_TAG],
      loyaltyConfig: { stampsRequired: 1, claimExpiryMinutes: 0 }, // both below schema min
    },
  };
  const sanitizeRes = await call(createDeal, sanitizeReq);
  const sanitizedCfg = sanitizeRes.body?.data?.loyaltyConfig;
  sanitizeRes.statusCode === 201 &&
  sanitizedCfg?.stampsRequired === 9 &&
  sanitizedCfg?.claimExpiryMinutes === 10080
    ? pass(
        "createDeal falls back to defaults for out-of-range loyaltyConfig instead of failing",
        JSON.stringify(sanitizedCfg),
      )
    : fail(
        "createDeal falls back to defaults for out-of-range loyaltyConfig instead of failing",
        `status=${sanitizeRes.statusCode} cfg=${JSON.stringify(sanitizedCfg)}`,
      );

  // A non-loyalty deal, to test guards that should reject it
  const voucherRes = await call(createDeal, {
    vendor: { id: vendor._id.toString() },
    body: {
      dealName: `Voucher e2e ${TEST_TAG}`,
      description: "control deal — not a loyalty deal",
      category: "other",
      dealType: "voucher",
      status: "active",
      isPublished: true,
      tags: [TEST_TAG],
    },
  });
  const voucherDealId = voucherRes.body?.data?._id;
  voucherRes.statusCode === 201
    ? pass("createDeal (voucher control deal) returns 201")
    : fail("createDeal (voucher control deal) returns 201", JSON.stringify(voucherRes.body));

  // ---------- updateDeal: loyaltyConfig merge + sanitization ----------
  const updateRes = await call(updateDeal, {
    vendor: { id: vendor._id.toString() },
    params: { id: dealId },
    body: { loyaltyConfig: { stampsRequired: 5, claimExpiryMinutes: 60 } },
  });
  const updatedCfg = updateRes.body?.data?.loyaltyConfig;
  updateRes.statusCode === 200 &&
  updatedCfg?.stampsRequired === 5 &&
  updatedCfg?.claimExpiryMinutes === 60
    ? pass("updateDeal applies valid loyaltyConfig changes", JSON.stringify(updatedCfg))
    : fail("updateDeal applies valid loyaltyConfig changes", JSON.stringify(updatedCfg));

  const updateClampRes = await call(updateDeal, {
    vendor: { id: vendor._id.toString() },
    params: { id: dealId },
    body: { loyaltyConfig: { stampsRequired: 500, claimExpiryMinutes: 999999 } },
  });
  const clampedCfg = updateClampRes.body?.data?.loyaltyConfig;
  clampedCfg?.stampsRequired === 100 && clampedCfg?.claimExpiryMinutes === 10080
    ? pass("updateDeal clamps out-of-range loyaltyConfig to schema bounds", JSON.stringify(clampedCfg))
    : fail("updateDeal clamps out-of-range loyaltyConfig to schema bounds", JSON.stringify(clampedCfg));

  // Restore to stampsRequired=5 for the rest of the flow
  const restoreRes = await call(updateDeal, {
    vendor: { id: vendor._id.toString() },
    params: { id: dealId },
    body: { loyaltyConfig: { stampsRequired: 5, claimExpiryMinutes: 10080 } },
  });
  const restoredCfg = restoreRes.body?.data?.loyaltyConfig;
  restoredCfg?.stampsRequired === 5
    ? pass("updateDeal restores stampsRequired=5 for flow tests")
    : fail("updateDeal restores stampsRequired=5 for flow tests", JSON.stringify(restoredCfg));

  // ---------- mobile: enrollLoyaltyDeal ----------
  const enrollRes1 = await call(enrollLoyaltyDeal, {
    user: { uid: TEST_USER },
    params: { id: dealId },
  });
  enrollRes1.statusCode === 200 && enrollRes1.body?.data?.card?.code
    ? pass("enrollLoyaltyDeal creates a card", enrollRes1.body.data.card.code)
    : fail("enrollLoyaltyDeal creates a card", JSON.stringify(enrollRes1.body));

  const cardCode = enrollRes1.body?.data?.card?.code;
  const cardId = enrollRes1.body?.data?.card?._id;

  const enrollRes2 = await call(enrollLoyaltyDeal, {
    user: { uid: TEST_USER },
    params: { id: dealId },
  });
  String(enrollRes2.body?.data?.card?._id) === String(cardId) &&
  enrollRes2.body?.data?.card?.code === cardCode
    ? pass("enrollLoyaltyDeal is idempotent (get-or-create returns same card)")
    : fail(
        "enrollLoyaltyDeal is idempotent (get-or-create returns same card)",
        JSON.stringify(enrollRes2.body),
      );

  const enrollWrongTypeRes = await call(enrollLoyaltyDeal, {
    user: { uid: TEST_USER },
    params: { id: voucherDealId },
  });
  enrollWrongTypeRes.statusCode === 404
    ? pass("enrollLoyaltyDeal rejects a non-loyalty deal (404)")
    : fail("enrollLoyaltyDeal rejects a non-loyalty deal (404)", String(enrollWrongTypeRes.statusCode));

  // ---------- mobile: getMyLoyaltyCards ----------
  const myCardsRes = await call(getMyLoyaltyCards, {
    user: { uid: TEST_USER },
    query: {},
  });
  const myCards = myCardsRes.body?.data || [];
  myCardsRes.statusCode === 200 && myCards.some((c) => c.code === cardCode)
    ? pass("getMyLoyaltyCards lists the enrolled card")
    : fail("getMyLoyaltyCards lists the enrolled card", JSON.stringify(myCardsRes.body));

  // ---------- vendor: recordLoyaltyStamp guards ----------
  const missingCodeRes = await call(recordLoyaltyStamp, {
    vendor: { id: vendor._id.toString() },
    body: {},
  });
  missingCodeRes.statusCode === 400
    ? pass("recordLoyaltyStamp rejects missing code (400)")
    : fail("recordLoyaltyStamp rejects missing code (400)", String(missingCodeRes.statusCode));

  const badCodeRes = await call(recordLoyaltyStamp, {
    vendor: { id: vendor._id.toString() },
    body: { code: "NOPE-0000" },
  });
  badCodeRes.statusCode === 404
    ? pass("recordLoyaltyStamp rejects unknown code (404)")
    : fail("recordLoyaltyStamp rejects unknown code (404)", String(badCodeRes.statusCode));

  const wrongVendorRes = await call(recordLoyaltyStamp, {
    vendor: { id: otherVendor._id.toString() },
    body: { code: cardCode },
  });
  wrongVendorRes.statusCode === 404
    ? pass("recordLoyaltyStamp rejects a card from a different vendor (404)")
    : fail(
        "recordLoyaltyStamp rejects a card from a different vendor (404)",
        String(wrongVendorRes.statusCode),
      );

  // ---------- vendor: recordLoyaltyStamp happy path (stampsRequired = 5) ----------
  let lastStampRes;
  for (let i = 1; i <= 4; i++) {
    lastStampRes = await call(recordLoyaltyStamp, {
      vendor: { id: vendor._id.toString() },
      body: { code: cardCode },
    });
    const stampCount = lastStampRes.body?.data?.card?.stampCount;
    if (lastStampRes.statusCode === 200 && stampCount === i && !lastStampRes.body?.data?.rewardClaim) {
      pass(`recordLoyaltyStamp #${i} increments stampCount without minting a reward`, `stampCount=${stampCount}`);
    } else {
      fail(
        `recordLoyaltyStamp #${i} increments stampCount without minting a reward`,
        JSON.stringify(lastStampRes.body),
      );
    }
  }

  const thresholdStampRes = await call(recordLoyaltyStamp, {
    vendor: { id: vendor._id.toString() },
    body: { code: cardCode },
  });
  const rewardClaim = thresholdStampRes.body?.data?.rewardClaim;
  const finalCardAfterReward = thresholdStampRes.body?.data?.card;
  thresholdStampRes.statusCode === 200 &&
  rewardClaim?.code &&
  rewardClaim.status === "claimed" &&
  finalCardAfterReward?.stampCount === 0
    ? pass(
        "5th stamp crosses stampsRequired=5, mints reward token, resets stampCount to 0",
        `rewardCode=${rewardClaim.code}`,
      )
    : fail(
        "5th stamp crosses stampsRequired=5, mints reward token, resets stampCount to 0",
        JSON.stringify(thresholdStampRes.body),
      );

  const cardAfterReward = await DealLoyaltyCard.findById(cardId);
  cardAfterReward?.rewardsIssuedCount === 1
    ? pass("card.rewardsIssuedCount incremented in DB")
    : fail("card.rewardsIssuedCount incremented in DB", String(cardAfterReward?.rewardsIssuedCount));

  const rewardClaimInDb = await DealClaim.findOne({ code: rewardClaim.code });
  rewardClaimInDb &&
  rewardClaimInDb.userId === TEST_USER &&
  rewardClaimInDb.dealId.toString() === String(dealId)
    ? pass("reward token persisted as a DealClaim tied to the right user/deal")
    : fail("reward token persisted as a DealClaim tied to the right user/deal", JSON.stringify(rewardClaimInDb));

  // Next stamp after a reward starts a fresh cycle at 1, not 6
  const postRewardStampRes = await call(recordLoyaltyStamp, {
    vendor: { id: vendor._id.toString() },
    body: { code: cardCode },
  });
  postRewardStampRes.body?.data?.card?.stampCount === 1 && !postRewardStampRes.body?.data?.rewardClaim
    ? pass("stamping after a reward starts a fresh cycle at stampCount=1")
    : fail(
        "stamping after a reward starts a fresh cycle at stampCount=1",
        JSON.stringify(postRewardStampRes.body),
      );

  // ---------- vendor: getDealLoyaltyCards ----------
  const listCardsRes = await call(getDealLoyaltyCards, {
    vendor: { id: vendor._id.toString() },
    params: { id: dealId },
    query: {},
  });
  const listedCard = (listCardsRes.body?.data || []).find((c) => c.code === cardCode);
  listCardsRes.statusCode === 200 && listedCard && listedCard.rewardsIssuedCount === 1
    ? pass("getDealLoyaltyCards lists the card with correct rewardsIssuedCount")
    : fail(
        "getDealLoyaltyCards lists the card with correct rewardsIssuedCount",
        JSON.stringify(listCardsRes.body),
      );

  const listCardsWrongVendorRes = await call(getDealLoyaltyCards, {
    vendor: { id: otherVendor._id.toString() },
    params: { id: dealId },
    query: {},
  });
  listCardsWrongVendorRes.statusCode === 403
    ? pass("getDealLoyaltyCards blocks a different vendor from viewing cards (403)")
    : fail(
        "getDealLoyaltyCards blocks a different vendor from viewing cards (403)",
        String(listCardsWrongVendorRes.statusCode),
      );

  // ---------- reward token behaves like a voucher: redeemVoucherCode ----------
  const redeemRes = await call(redeemVoucherCode, {
    vendor: { id: vendor._id.toString() },
    body: { code: rewardClaim.code },
  });
  redeemRes.statusCode === 200 && redeemRes.body?.data?.status === "redeemed"
    ? pass("redeemVoucherCode redeems the loyalty reward token")
    : fail("redeemVoucherCode redeems the loyalty reward token", JSON.stringify(redeemRes.body));

  const reRedeemRes = await call(redeemVoucherCode, {
    vendor: { id: vendor._id.toString() },
    body: { code: rewardClaim.code },
  });
  reRedeemRes.statusCode === 409
    ? pass("redeemVoucherCode blocks re-redeeming the same reward token (409)")
    : fail(
        "redeemVoucherCode blocks re-redeeming the same reward token (409)",
        String(reRedeemRes.statusCode),
      );

  // ---------- concurrency: only one reward minted per threshold crossing ----------
  const raceEnroll = await call(enrollLoyaltyDeal, {
    user: { uid: `${TEST_USER}-race` },
    params: { id: dealId },
  });
  const raceCode = raceEnroll.body?.data?.card?.code;

  // Card starts at stampCount=1 (post-reward cycle logic tested above resets to 0 only
  // for the original card); this is a fresh card so it starts at 0. Fire exactly
  // stampsRequired=5 concurrent stamp requests — exactly one should mint a reward.
  const concurrentResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      call(recordLoyaltyStamp, {
        vendor: { id: vendor._id.toString() },
        body: { code: raceCode },
      }),
    ),
  );
  const rewardsMinted = concurrentResults.filter((r) => r.body?.data?.rewardClaim).length;
  const raceCardFinal = await DealLoyaltyCard.findOne({ code: raceCode });

  rewardsMinted === 1
    ? pass("exactly one reward minted across 5 concurrent stamp requests")
    : fail(
        "exactly one reward minted across 5 concurrent stamp requests",
        `rewardsMinted=${rewardsMinted}`,
      );

  raceCardFinal?.stampCount === 0 && raceCardFinal?.rewardsIssuedCount === 1
    ? pass("race card ends with stampCount=0 and rewardsIssuedCount=1", JSON.stringify({
        stampCount: raceCardFinal?.stampCount,
        rewardsIssuedCount: raceCardFinal?.rewardsIssuedCount,
      }))
    : fail(
        "race card ends with stampCount=0 and rewardsIssuedCount=1",
        JSON.stringify({
          stampCount: raceCardFinal?.stampCount,
          rewardsIssuedCount: raceCardFinal?.rewardsIssuedCount,
        }),
      );

  // ---------- cleanup ----------
  const dealIds = (await Deal.find({ tags: TEST_TAG }).select("_id")).map((d) => d._id);
  await DealLoyaltyCard.deleteMany({ dealId: { $in: dealIds } });
  await DealClaim.deleteMany({ dealId: { $in: dealIds } });
  await Deal.deleteMany({ _id: { $in: dealIds } });
  await Vendor.deleteMany({ _id: { $in: [vendor._id, otherVendor._id] } });
  pass("cleaned up temporary vendors/deals/cards/claims");

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    failed.forEach((f) => console.log(` - ${f.name}: ${f.detail || ""}`));
  }

  await mongoose.disconnect();
  process.exit(failed.length ? 1 : 0);
}

run().catch(async (err) => {
  console.error("E2E fatal:", err);
  try {
    await DealLoyaltyCard.deleteMany({ userId: new RegExp(`^${TEST_USER}`) });
    await DealClaim.deleteMany({ userId: new RegExp(`^${TEST_USER}`) });
    await Deal.deleteMany({ tags: TEST_TAG });
    await Vendor.deleteMany({ companyName: new RegExp(TEST_TAG) });
  } catch {
    /* ignore cleanup errors */
  }
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
