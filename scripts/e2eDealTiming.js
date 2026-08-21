/**
 * End-to-end timing checks for ambient active windows + voucher claim expiry/redeem.
 *
 * Uses the real MongoDB + the same helpers/controllers paths as production:
 *   - isActiveNow (ambient)
 *   - claim minting (expiresAt = now + claimExpiryMinutes)
 *   - redeem lazy-settle (expireClaimAndRelease) then redeem rules
 *
 * Creates temporary vendor/deals/claims tagged with TEST_TAG and deletes them after.
 *
 * Usage (from backend/):
 *   node scripts/e2eDealTiming.js
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Deal from "../models/dealModel.js";
import DealClaim from "../models/dealClaimModel.js";
import Vendor from "../models/vendorModel.js";
import { isActiveNow } from "../utils/ambientWindowUtils.js";
import { expireClaimAndRelease } from "../utils/dealClaimUtils.js";
import { generateUniqueVoucherCode } from "../utils/voucherCodeUtils.js";

dotenv.config();

const TEST_TAG = `__e2e_deal_timing_${Date.now()}__`;
const TEST_USER = `e2e-user-${Date.now()}`;
const HOLD_MS = 2500; // short hold so we can wait for real expiry in this run

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true });
  console.log(`PASS | ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ""}`);
}

function colomboParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  let hour = get("hour") ?? "00";
  if (hour === "24") hour = "00";
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: weekdayMap[get("weekday")],
    time: `${hour.padStart(2, "0")}:${(get("minute") ?? "00").padStart(2, "0")}`,
  };
}

/** Mirrors dealController.redeemVoucherCode settle + gate (DB-backed). */
async function attemptRedeem(code, vendorId) {
  const normalizedCode = code.trim().toUpperCase();
  let claim = await DealClaim.findOne({
    code: normalizedCode,
    vendorId,
  });

  if (!claim) {
    return { ok: false, statusCode: 404, message: "Voucher code not found for your venue" };
  }

  if (claim.status === "claimed" && claim.expiresAt < new Date()) {
    await expireClaimAndRelease(claim._id);
    claim = await DealClaim.findById(claim._id);
  }

  if (claim.status === "redeemed") {
    return { ok: false, statusCode: 409, message: "already redeemed", claim };
  }
  if (claim.status === "expired") {
    return { ok: false, statusCode: 410, message: "This voucher has expired", claim };
  }
  if (claim.status === "cancelled") {
    return { ok: false, statusCode: 410, message: "This voucher has been cancelled", claim };
  }

  claim.status = "redeemed";
  claim.redeemedAt = new Date();
  await claim.save();
  return { ok: true, statusCode: 200, message: "Voucher redeemed successfully", claim };
}

/** Mirrors mobileController claim expiry calculation. */
function claimExpiryMinutesFromDeal(deal) {
  const config =
    deal.dealType === "limited-quantity"
      ? deal.limitedQuantityConfig
      : deal.voucherConfig;
  return config?.claimExpiryMinutes || (deal.dealType === "limited-quantity" ? 30 : 120);
}

async function mintClaim({ deal, userId, expiresAt }) {
  const code = await generateUniqueVoucherCode();
  return DealClaim.create({
    dealId: deal._id,
    vendorId: deal.vendorId,
    userId,
    code,
    expiresAt,
  });
}

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI missing");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB\n");

  const vendor = await Vendor.create({
    email: `e2e-timing-${Date.now()}@example.com`,
    password: "not-used-for-e2e",
    authProvider: "local",
    isProfileComplete: true,
    registrationStep: 3,
    companyName: `E2E Timing Vendor ${TEST_TAG}`,
  });

  // Sign a vendor JWT the same way the API would (for sanity that auth secret works)
  const vendorToken = jwt.sign({ id: vendor._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
  const decoded = jwt.verify(vendorToken, process.env.JWT_SECRET);
  if (String(decoded.id) !== String(vendor._id)) {
    fail("vendor JWT round-trip");
  } else {
    pass("vendor JWT round-trip");
  }

  const { day, time } = colomboParts();
  console.log(`Colombo now: day=${day} time=${time}\n`);

  // ---------- Ambient active window (persisted deals) ----------
  const ambientAlways = await Deal.create({
    vendorId: vendor._id,
    dealName: `Ambient always ${TEST_TAG}`,
    description: "e2e ambient always-on",
    category: "other",
    dealType: "ambient",
    status: "active",
    isPublished: true,
    tags: [TEST_TAG],
    activeWindow: {},
  });

  const ambientToday = await Deal.create({
    vendorId: vendor._id,
    dealName: `Ambient today ${TEST_TAG}`,
    description: "e2e ambient today only",
    category: "other",
    dealType: "ambient",
    status: "active",
    isPublished: true,
    tags: [TEST_TAG],
    activeWindow: { daysOfWeek: [day] },
  });

  const ambientOtherDay = await Deal.create({
    vendorId: vendor._id,
    dealName: `Ambient other day ${TEST_TAG}`,
    description: "e2e ambient wrong day",
    category: "other",
    dealType: "ambient",
    status: "active",
    isPublished: true,
    tags: [TEST_TAG],
    activeWindow: { daysOfWeek: [(day + 1) % 7] },
  });

  // Build a same-day window that includes now (±60m when possible)
  const [h, m] = time.split(":").map(Number);
  const startMin = Math.max(0, h * 60 + m - 60);
  const endMin = Math.min(23 * 60 + 59, h * 60 + m + 60);
  const fmt = (mins) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const windowStart = fmt(startMin);
  const windowEnd = fmt(endMin);

  const ambientInWindow = await Deal.create({
    vendorId: vendor._id,
    dealName: `Ambient in window ${TEST_TAG}`,
    description: "e2e ambient in window",
    category: "other",
    dealType: "ambient",
    status: "active",
    isPublished: true,
    tags: [TEST_TAG],
    activeWindow: {
      daysOfWeek: [day],
      startTime: windowStart,
      endTime: windowEnd,
    },
  });

  const ambientPastWindow = await Deal.create({
    vendorId: vendor._id,
    dealName: `Ambient past window ${TEST_TAG}`,
    description: "e2e ambient past window",
    category: "other",
    dealType: "ambient",
    status: "active",
    isPublished: true,
    tags: [TEST_TAG],
    activeWindow: {
      daysOfWeek: [day],
      startTime: "00:00",
      endTime: "00:01",
    },
  });

  const expectAlways = isActiveNow(ambientAlways.activeWindow) === true;
  expectAlways
    ? pass("ambient empty window is active now")
    : fail("ambient empty window is active now", String(isActiveNow(ambientAlways.activeWindow)));

  isActiveNow(ambientToday.activeWindow)
    ? pass("ambient today-only is active now")
    : fail("ambient today-only is active now");

  !isActiveNow(ambientOtherDay.activeWindow)
    ? pass("ambient other-day is inactive now")
    : fail("ambient other-day is inactive now");

  const inWindowExpected = time >= windowStart && time < windowEnd;
  const inWindowActual = isActiveNow(ambientInWindow.activeWindow);
  inWindowActual === inWindowExpected
    ? pass(
        "ambient same-day window around now",
        `${windowStart}-${windowEnd} => ${inWindowActual}`,
      )
    : fail(
        "ambient same-day window around now",
        `expected ${inWindowExpected} got ${inWindowActual}`,
      );

  const pastExpected = time >= "00:00" && time < "00:01";
  const pastActual = isActiveNow(ambientPastWindow.activeWindow);
  pastActual === pastExpected
    ? pass("ambient past window inactive (except at 00:00)", `=> ${pastActual}`)
    : fail("ambient past window", `expected ${pastExpected} got ${pastActual}`);

  // ---------- Voucher claim expiry + redeem ----------
  const voucherDeal = await Deal.create({
    vendorId: vendor._id,
    dealName: `Voucher e2e ${TEST_TAG}`,
    description: "e2e voucher claim expiry",
    category: "other",
    dealType: "voucher",
    status: "active",
    isPublished: true,
    tags: [TEST_TAG],
    voucherConfig: {
      claimExpiryMinutes: 5, // schema min; we override expiresAt for short wait
      rewardLabel: "E2E Free Drink",
    },
  });

  const configuredMinutes = claimExpiryMinutesFromDeal(voucherDeal);
  configuredMinutes === 5
    ? pass("voucher claimExpiryMinutes read from deal config", `${configuredMinutes}m`)
    : fail("voucher claimExpiryMinutes read from deal config", String(configuredMinutes));

  // A) Redeem succeeds while still inside hold window
  const liveClaim = await mintClaim({
    deal: voucherDeal,
    userId: `${TEST_USER}-live`,
    expiresAt: new Date(Date.now() + configuredMinutes * 60 * 1000),
  });
  const liveRedeem = await attemptRedeem(liveClaim.code, vendor._id);
  liveRedeem.ok
    ? pass("redeem succeeds before expiry", liveClaim.code)
    : fail("redeem succeeds before expiry", liveRedeem.message);

  const liveAfter = await DealClaim.findById(liveClaim._id);
  liveAfter?.status === "redeemed" && liveAfter.redeemedAt
    ? pass("claim status flipped to redeemed with redeemedAt")
    : fail("claim status flipped to redeemed with redeemedAt", liveAfter?.status);

  // Re-redeem blocked
  const reredem = await attemptRedeem(liveClaim.code, vendor._id);
  !reredem.ok && reredem.statusCode === 409
    ? pass("re-redeem blocked after success")
    : fail("re-redeem blocked after success", JSON.stringify(reredem));

  // B) Short-lived claim: confirm live, wait for real clock expiry, then redeem must fail
  const shortClaim = await mintClaim({
    deal: voucherDeal,
    userId: `${TEST_USER}-short`,
    expiresAt: new Date(Date.now() + HOLD_MS),
  });
  pass(
    "minted short-lived claim",
    `${shortClaim.code} expiresAt=${shortClaim.expiresAt.toISOString()}`,
  );

  const stillLive =
    shortClaim.status === "claimed" && shortClaim.expiresAt > new Date();
  stillLive
    ? pass("short claim is live before wait")
    : fail("short claim is live before wait");

  console.log(`Waiting ${HOLD_MS + 500}ms for claim ${shortClaim.code} to expire...`);
  await new Promise((r) => setTimeout(r, HOLD_MS + 500));

  const expiredRedeem = await attemptRedeem(shortClaim.code, vendor._id);
  !expiredRedeem.ok && expiredRedeem.statusCode === 410
    ? pass("redeem blocked after expiry (410)", expiredRedeem.message)
    : fail("redeem blocked after expiry (410)", JSON.stringify(expiredRedeem));

  const expiredDoc = await DealClaim.findById(shortClaim._id);
  expiredDoc?.status === "expired"
    ? pass("expired claim settled to status=expired in DB")
    : fail("expired claim settled to status=expired in DB", expiredDoc?.status);

  // C) Explicit: claim expires, list-style settle, then redeem fails
  const settleClaim = await mintClaim({
    deal: voucherDeal,
    userId: `${TEST_USER}-settle`,
    expiresAt: new Date(Date.now() + 800),
  });
  await new Promise((r) => setTimeout(r, 1200));
  const settled = await expireClaimAndRelease(settleClaim._id);
  settled?.status === "expired"
    ? pass("expireClaimAndRelease settles claimed -> expired")
    : fail("expireClaimAndRelease settles claimed -> expired", settled?.status);
  const afterSettleRedeem = await attemptRedeem(settleClaim.code, vendor._id);
  !afterSettleRedeem.ok && afterSettleRedeem.statusCode === 410
    ? pass("redeem after settle returns expired")
    : fail("redeem after settle returns expired", JSON.stringify(afterSettleRedeem));

  // D) Default expiry math as claimDeal would compute (120m when config missing)
  const defaultVoucher = await Deal.create({
    vendorId: vendor._id,
    dealName: `Voucher defaults ${TEST_TAG}`,
    description: "e2e default claim expiry",
    category: "other",
    dealType: "voucher",
    status: "active",
    isPublished: true,
    tags: [TEST_TAG],
    voucherConfig: { rewardLabel: "Default window" }, // claimExpiryMinutes schema default 120
  });
  const mins = claimExpiryMinutesFromDeal(defaultVoucher);
  const claimedAt = Date.now();
  const expectedExpiry = claimedAt + mins * 60 * 1000;
  const defaultClaim = await mintClaim({
    deal: defaultVoucher,
    userId: `${TEST_USER}-default`,
    expiresAt: new Date(expectedExpiry),
  });
  const delta = Math.abs(defaultClaim.expiresAt.getTime() - expectedExpiry);
  mins === 120 && delta < 5
    ? pass("default voucher hold is 120 minutes from claim time", defaultClaim.expiresAt.toISOString())
    : fail("default voucher hold is 120 minutes from claim time", `mins=${mins} delta=${delta}`);

  // Cleanup test docs
  const dealIds = (
    await Deal.find({ tags: TEST_TAG }).select("_id")
  ).map((d) => d._id);
  await DealClaim.deleteMany({ dealId: { $in: dealIds } });
  await Deal.deleteMany({ _id: { $in: dealIds } });
  await Vendor.deleteOne({ _id: vendor._id });
  pass("cleaned up temporary vendor/deals/claims");

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
