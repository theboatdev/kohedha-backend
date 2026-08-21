import express from "express";
import {
  createDeal,
  getAllDeals,
  getDealById,
  updateDeal,
  deleteDeal,
  getDealsByCategory,
  redeemVoucherCode,
  getDealClaims,
} from "../controller/dealController.js";
import {
  recordLoyaltyStamp,
  getDealLoyaltyCards,
} from "../controller/loyaltyController.js";
import { protect } from "../middleware/auth.js";
import { uploadDealImage } from "../middleware/upload.js";

const router = express.Router();

router.use(protect);

// Voucher redemption (staff-side) - must come before /:id to avoid being swallowed
router.post("/redeem", redeemVoucherCode);

// Loyalty stamping (staff-side) - must come before /:id to avoid being swallowed
router.post("/loyalty/stamp", recordLoyaltyStamp);

// CRUD routes
router.post("/new", uploadDealImage.single("image"), createDeal);
router.get("/", getAllDeals);
router.get("/category/:category", getDealsByCategory);
router.get("/:id", getDealById);
router.put("/:id", uploadDealImage.single("image"), updateDeal);
router.delete("/:id", deleteDeal);
router.get("/:id/claims", getDealClaims);
router.get("/:id/loyalty-cards", getDealLoyaltyCards);

export default router;
