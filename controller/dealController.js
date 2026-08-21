import Deal from "../models/dealModel.js";
import DealClaim from "../models/dealClaimModel.js";
import cloudinary from "../config/cloudinary.js";
import { isActiveNow } from "../utils/ambientWindowUtils.js";
import { expireClaimAndRelease } from "../utils/dealClaimUtils.js";

// Serialize a deal document, appending isActiveNow for ambient deals
function serializeDeal(deal) {
  const obj = deal.toObject ? deal.toObject() : { ...deal };
  return {
    ...obj,
    isActiveNow:
      obj.dealType === "ambient" ? isActiveNow(obj.activeWindow) : null,
  };
}

// Helper: extract cloudinary public_id from URL
function extractPublicId(url) {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-z]+$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Helper: delete a single image from cloudinary
async function deleteCloudinaryImage(url) {
  if (!url) return;
  try {
    const publicId = extractPublicId(url);
    if (publicId) await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Failed to delete cloudinary image:", err);
  }
}

// Create a new deal
export const createDeal = async (req, res) => {
  try {
    const {
      dealName,
      description,
      category,
      notes,
      mainImage,
      images,
      socialLinks,
      contactInfo,
      status,
      priority,
      tags: rawTags,
      isPublished,
      startDate,
      endDate,
      dealType,
      activeWindow: rawActiveWindow,
      voucherConfig: rawVoucherConfig,
      limitedQuantityConfig: rawLimitedQuantityConfig,
      loyaltyConfig: rawLoyaltyConfig,
    } = req.body;

    let tags = rawTags;
    if (typeof rawTags === "string") {
      try {
        tags = JSON.parse(rawTags);
      } catch {
        tags = rawTags ? [rawTags] : [];
      }
    }

    let activeWindow = rawActiveWindow;
    if (typeof rawActiveWindow === "string") {
      try {
        activeWindow = JSON.parse(rawActiveWindow);
      } catch {
        activeWindow = null;
      }
    }

    let voucherConfig = rawVoucherConfig;
    if (typeof rawVoucherConfig === "string") {
      try {
        voucherConfig = JSON.parse(rawVoucherConfig);
      } catch {
        voucherConfig = null;
      }
    }

    let limitedQuantityConfig = rawLimitedQuantityConfig;
    if (typeof rawLimitedQuantityConfig === "string") {
      try {
        limitedQuantityConfig = JSON.parse(rawLimitedQuantityConfig);
      } catch {
        limitedQuantityConfig = null;
      }
    }

    let loyaltyConfig = rawLoyaltyConfig;
    if (typeof rawLoyaltyConfig === "string") {
      try {
        loyaltyConfig = JSON.parse(rawLoyaltyConfig);
      } catch {
        loyaltyConfig = null;
      }
    }

    // Validation
    if (!dealName || !description || !category) {
      console.error("[Create Deal] Validation failed: Missing required fields");
      return res.status(400).json({
        success: false,
        message:
          "Please fill in all required fields (dealName, description, category)",
      });
    }

    if (dealType === "limited-quantity") {
      const totalQuantity = Number(limitedQuantityConfig?.totalQuantity);
      if (!totalQuantity || totalQuantity < 1) {
        return res.status(400).json({
          success: false,
          message:
            "Please provide a totalQuantity of at least 1 for a limited-quantity deal",
        });
      }
      const claimExpiryMinutes = Number(
        limitedQuantityConfig?.claimExpiryMinutes,
      );
      // remainingQuantity always starts equal to totalQuantity — clients can't set it directly
      limitedQuantityConfig = {
        totalQuantity,
        remainingQuantity: totalQuantity,
        claimExpiryMinutes:
          Number.isFinite(claimExpiryMinutes) && claimExpiryMinutes >= 5
            ? Math.min(claimExpiryMinutes, 10080)
            : 30,
        rewardLabel: limitedQuantityConfig?.rewardLabel || "",
      };
    } else {
      // Don't persist an empty nested object — Mongoose would still run
      // min validators on claimExpiryMinutes and reject the create.
      limitedQuantityConfig = undefined;
    }

    if (dealType === "loyalty") {
      const stampsRequired = Number(loyaltyConfig?.stampsRequired);
      const claimExpiryMinutes = Number(loyaltyConfig?.claimExpiryMinutes);
      loyaltyConfig = {
        stampsRequired:
          Number.isFinite(stampsRequired) && stampsRequired >= 2
            ? Math.min(stampsRequired, 100)
            : 9,
        claimExpiryMinutes:
          Number.isFinite(claimExpiryMinutes) && claimExpiryMinutes >= 5
            ? Math.min(claimExpiryMinutes, 10080)
            : 10080,
        rewardLabel: loyaltyConfig?.rewardLabel || "",
      };
    } else {
      // Don't persist an empty nested object — Mongoose would still run
      // min validators on the nested numeric fields and reject the create.
      loyaltyConfig = undefined;
    }

    // Build mainImage: prefer uploaded file, fallback to body value
    let resolvedMainImage = mainImage || null;
    if (req.file) {
      resolvedMainImage = { url: req.file.path };
    }

    // Create deal
    const deal = await Deal.create({
      vendorId: req.vendor.id,
      dealName,
      description,
      category,
      notes: notes || "",
      mainImage: resolvedMainImage || {},
      images: images || [],
      socialLinks: socialLinks || {},
      contactInfo: contactInfo || {},
      status: status || "active",
      priority: priority || 5,
      tags: tags || [],
      isPublished: isPublished || false,
      publishedAt: isPublished ? new Date() : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      dealType: dealType || "ambient",
      activeWindow: activeWindow || {},
      voucherConfig: voucherConfig || {},
      ...(limitedQuantityConfig ? { limitedQuantityConfig } : {}),
      ...(loyaltyConfig ? { loyaltyConfig } : {}),
    });

    console.log(
      `[Create Deal] Successfully created deal: ${deal._id} - ${deal.dealName}`,
    );
    res.status(201).json({
      success: true,
      message: "Deal created successfully",
      data: serializeDeal(deal),
    });
  } catch (error) {
    console.error("[Create Deal] Error creating deal:", error.message);
    if (error.name === "ValidationError") {
      const firstMessage = Object.values(error.errors || {})[0]?.message;
      return res.status(400).json({
        success: false,
        message: firstMessage || error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error creating deal",
    });
  }
};

// Get all deals for vendor with filters and sorting
export const getAllDeals = async (req, res) => {
  try {
    const {
      status,
      category,
      isPublished,
      sortBy,
      page = 1,
      limit = 10,
    } = req.query;

    // Build filter - filter by vendor
    let filter = { vendorId: req.vendor.id };

    if (status) {
      filter.status = status;
    }

    if (category) {
      filter.category = category;
    }

    if (isPublished !== undefined) {
      filter.isPublished = isPublished === "true";
    }

    // Sort options
    let sort = { createdAt: -1 }; // Default: newest first

    if (sortBy === "oldest") {
      sort = { createdAt: 1 };
    } else if (sortBy === "rating") {
      sort = { rating: -1 };
    } else if (sortBy === "priority") {
      sort = { priority: 1 };
    } else if (sortBy === "popular") {
      sort = { priority: 1, rating: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const totalDeals = await Deal.countDocuments(filter);
    const deals = await Deal.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    console.log(
      `[Get All Deals] Successfully fetched ${deals.length} deals out of ${totalDeals} total`,
    );
    res.status(200).json({
      success: true,
      data: deals.map(serializeDeal),
      pagination: {
        total: totalDeals,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalDeals / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Get All Deals] Error fetching deals:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deals",
    });
  }
};

// Get single deal by ID - vendor specific
export const getDealById = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);

    if (!deal) {
      console.warn(`[Get Deal By ID] Deal not found: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Deal not found",
      });
    }

    // Check if vendor owns this deal
    if (deal.vendorId.toString() !== req.vendor.id) {
      console.warn(
        `[Get Deal By ID] Unauthorized access attempt for deal: ${req.params.id}`,
      );
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this deal",
      });
    }

    console.log(`[Get Deal By ID] Successfully fetched deal: ${deal._id}`);
    res.status(200).json({
      success: true,
      data: serializeDeal(deal),
    });
  } catch (error) {
    console.error("[Get Deal By ID] Error fetching deal:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deal",
    });
  }
};

// Update deal - vendor specific
export const updateDeal = async (req, res) => {
  try {
    let deal = await Deal.findById(req.params.id);

    if (!deal) {
      console.warn(`[Update Deal] Deal not found: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Deal not found",
      });
    }

    // Check ownership
    if (deal.vendorId.toString() !== req.vendor.id) {
      console.warn(
        `[Update Deal] Unauthorized update attempt for deal: ${req.params.id}`,
      );
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this deal",
      });
    }

    // Update fields
    const {
      dealName,
      description,
      category,
      notes,
      mainImage,
      images,
      socialLinks,
      contactInfo,
      status,
      priority,
      tags: rawTags,
      isPublished,
      startDate,
      endDate,
      dealType,
      activeWindow: rawActiveWindow,
      voucherConfig: rawVoucherConfig,
      limitedQuantityConfig: rawLimitedQuantityConfig,
      loyaltyConfig: rawLoyaltyConfig,
    } = req.body;

    let tags = rawTags;
    if (typeof rawTags === "string") {
      try {
        tags = JSON.parse(rawTags);
      } catch {
        tags = rawTags ? [rawTags] : [];
      }
    }

    let activeWindow = rawActiveWindow;
    if (typeof rawActiveWindow === "string") {
      try {
        activeWindow = JSON.parse(rawActiveWindow);
      } catch {
        activeWindow = undefined;
      }
    }

    let voucherConfig = rawVoucherConfig;
    if (typeof rawVoucherConfig === "string") {
      try {
        voucherConfig = JSON.parse(rawVoucherConfig);
      } catch {
        voucherConfig = undefined;
      }
    }

    let limitedQuantityConfig = rawLimitedQuantityConfig;
    if (typeof rawLimitedQuantityConfig === "string") {
      try {
        limitedQuantityConfig = JSON.parse(rawLimitedQuantityConfig);
      } catch {
        limitedQuantityConfig = undefined;
      }
    }

    let loyaltyConfig = rawLoyaltyConfig;
    if (typeof rawLoyaltyConfig === "string") {
      try {
        loyaltyConfig = JSON.parse(rawLoyaltyConfig);
      } catch {
        loyaltyConfig = undefined;
      }
    }

    if (dealName) deal.dealName = dealName;
    if (description) deal.description = description;
    if (category) deal.category = category;
    if (notes !== undefined) deal.notes = notes;
    if (socialLinks) deal.socialLinks = { ...deal.socialLinks, ...socialLinks };
    if (contactInfo) deal.contactInfo = { ...deal.contactInfo, ...contactInfo };
    if (status) deal.status = status;
    if (priority !== undefined) deal.priority = priority;
    if (tags) deal.tags = tags;
    if (startDate !== undefined)
      deal.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
      deal.endDate = endDate ? new Date(endDate) : null;
    if (dealType) deal.dealType = dealType;
    if (activeWindow !== undefined) deal.activeWindow = activeWindow;
    if (voucherConfig !== undefined)
      deal.voucherConfig = { ...deal.voucherConfig, ...voucherConfig };
    if (limitedQuantityConfig !== undefined) {
      const current = deal.limitedQuantityConfig || {};
      const nextTotal = Number(
        limitedQuantityConfig.totalQuantity ?? current.totalQuantity ?? 0,
      );
      // Never let clients set remainingQuantity directly — only totalQuantity
      // changes flow through, shifting remaining by the same delta so
      // slots already claimed/held stay accounted for.
      const currentTotal = Number(current.totalQuantity ?? 0);
      const currentRemaining = Number(current.remainingQuantity ?? 0);
      const delta = nextTotal - currentTotal;
      const nextRemaining = Math.max(0, currentRemaining + delta);

      const rawExpiry = Number(
        limitedQuantityConfig.claimExpiryMinutes ??
          current.claimExpiryMinutes ??
          30,
      );
      const claimExpiryMinutes =
        Number.isFinite(rawExpiry) && rawExpiry >= 5
          ? Math.min(rawExpiry, 10080)
          : 30;

      deal.limitedQuantityConfig = {
        ...current,
        ...limitedQuantityConfig,
        totalQuantity: nextTotal,
        remainingQuantity: nextRemaining,
        claimExpiryMinutes,
      };
    }
    if (loyaltyConfig !== undefined) {
      const current = deal.loyaltyConfig || {};

      const rawStamps = Number(
        loyaltyConfig.stampsRequired ?? current.stampsRequired ?? 9,
      );
      const stampsRequired =
        Number.isFinite(rawStamps) && rawStamps >= 2
          ? Math.min(rawStamps, 100)
          : 9;

      const rawExpiry = Number(
        loyaltyConfig.claimExpiryMinutes ?? current.claimExpiryMinutes ?? 10080,
      );
      const claimExpiryMinutes =
        Number.isFinite(rawExpiry) && rawExpiry >= 5
          ? Math.min(rawExpiry, 10080)
          : 10080;

      deal.loyaltyConfig = {
        ...current,
        ...loyaltyConfig,
        stampsRequired,
        claimExpiryMinutes,
      };
    }

    // Handle image update
    if (req.file) {
      // Delete old image from cloudinary if it exists
      await deleteCloudinaryImage(deal.mainImage && deal.mainImage.url);
      deal.mainImage = { url: req.file.path };
    } else if (mainImage !== undefined) {
      // Allow updating mainImage object from body (e.g. updating alt text)
      deal.mainImage = mainImage;
    }

    // Allow client to explicitly remove the image
    if (req.body.removeImage === "true" || req.body.removeImage === true) {
      await deleteCloudinaryImage(deal.mainImage && deal.mainImage.url);
      deal.mainImage = {};
    }

    if (images !== undefined) deal.images = images;

    // Handle publishing
    if (isPublished !== undefined) {
      deal.isPublished = isPublished;
      if (isPublished && !deal.publishedAt) {
        deal.publishedAt = new Date();
      }
    }

    const updatedDeal = await deal.save();

    console.log(`[Update Deal] Successfully updated deal: ${updatedDeal._id}`);
    res.status(200).json({
      success: true,
      message: "Deal updated successfully",
      data: serializeDeal(updatedDeal),
    });
  } catch (error) {
    console.error("[Update Deal] Error updating deal:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error updating deal",
    });
  }
};

// Delete deal - vendor specific
export const deleteDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);

    if (!deal) {
      console.warn(`[Delete Deal] Deal not found: ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: "Deal not found",
      });
    }

    // Check ownership
    if (deal.vendorId.toString() !== req.vendor.id) {
      console.warn(
        `[Delete Deal] Unauthorized delete attempt for deal: ${req.params.id}`,
      );
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this deal",
      });
    }

    // Delete main image from cloudinary if it exists
    await deleteCloudinaryImage(deal.mainImage && deal.mainImage.url);

    await Deal.findByIdAndDelete(req.params.id);

    console.log(`[Delete Deal] Successfully deleted deal: ${req.params.id}`);
    res.status(200).json({
      success: true,
      message: "Deal deleted successfully",
    });
  } catch (error) {
    console.error("[Delete Deal] Error deleting deal:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting deal",
    });
  }
};

// Search deals by tags and keywords - vendor specific
export const searchDeals = async (req, res) => {
  try {
    const { keyword, tags } = req.query;

    let filter = { vendorId: req.vendor.id, isPublished: true };

    if (keyword) {
      filter.$or = [
        { dealName: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
        { notes: { $regex: keyword, $options: "i" } },
      ];
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    const deals = await Deal.find(filter).sort({ priority: 1, rating: -1 });

    console.log(
      `[Search Deals] Found ${deals.length} deals for vendor ${req.vendor.id} matching keyword: "${keyword}" with tags: ${tags}`,
    );
    res.status(200).json({
      success: true,
      data: deals.map(serializeDeal),
    });
  } catch (error) {
    console.error("[Search Deals] Error searching deals:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error searching deals",
    });
  }
};

// Get deals by category - vendor specific
export const getDealsByCategory = async (req, res) => {
  try {
    const { category, sortBy, page = 1, limit = 10 } = req.query;

    if (!category) {
      console.error(
        "[Get Deals By Category] Validation failed: Category is required",
      );
      return res.status(400).json({
        success: false,
        message: "Category is required",
      });
    }

    let sort = { priority: 1, rating: -1 };

    if (sortBy === "newest") {
      sort = { publishedAt: -1 };
    } else if (sortBy === "rating") {
      sort = { rating: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const totalDeals = await Deal.countDocuments({
      vendorId: req.vendor.id,
      category,
      isPublished: true,
    });

    const deals = await Deal.find({
      vendorId: req.vendor.id,
      category,
      isPublished: true,
    })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    console.log(
      `[Get Deals By Category] Fetched ${deals.length} deals for vendor ${req.vendor.id} in category: ${category}`,
    );
    res.status(200).json({
      success: true,
      data: deals.map(serializeDeal),
      pagination: {
        total: totalDeals,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalDeals / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error(
      "[Get Deals By Category] Error fetching deals by category:",
      error.message,
    );
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deals by category",
    });
  }
};

// POST /api/vendor/deals/redeem
// Staff-side redemption: looks up a voucher claim by its code, validates it
// belongs to this vendor and is still usable, then flips it to "redeemed".
// This is the only place a claim transitions to redeemed - always server-side.
export const redeemVoucherCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please provide a voucher code",
      });
    }

    const normalizedCode = code.trim().toUpperCase();

    let claim = await DealClaim.findOne({
      code: normalizedCode,
      vendorId: req.vendor.id,
    }).populate({
      path: "dealId",
      select: "dealName description dealType voucherConfig limitedQuantityConfig loyaltyConfig",
    });

    if (!claim) {
      console.warn(
        `[Redeem Voucher] Code not found for vendor ${req.vendor.id}: ${normalizedCode}`,
      );
      return res.status(404).json({
        success: false,
        message: "Voucher code not found for your venue",
      });
    }

    // Lazily settle expiry so stale "claimed" claims don't redeem past their
    // window — also releases the reserved slot back to stock for
    // limited-quantity deals.
    if (claim.status === "claimed" && claim.expiresAt < new Date()) {
      await expireClaimAndRelease(claim._id);
      claim = await DealClaim.findById(claim._id).populate({
        path: "dealId",
        select: "dealName description dealType voucherConfig limitedQuantityConfig loyaltyConfig",
      });
    }

    if (claim.status === "redeemed") {
      return res.status(409).json({
        success: false,
        message: `This voucher was already redeemed at ${new Date(
          claim.redeemedAt,
        ).toLocaleString()}`,
        data: claim,
      });
    }

    if (claim.status === "expired") {
      return res.status(410).json({
        success: false,
        message: "This voucher has expired",
        data: claim,
      });
    }

    if (claim.status === "cancelled") {
      return res.status(410).json({
        success: false,
        message: "This voucher has been cancelled",
        data: claim,
      });
    }

    // status === "claimed" and still within window -> redeem it now
    claim.status = "redeemed";
    claim.redeemedAt = new Date();
    await claim.save();

    console.log(
      `[Redeem Voucher] Vendor ${req.vendor.id} redeemed code ${normalizedCode} (deal ${claim.dealId?._id})`,
    );

    res.status(200).json({
      success: true,
      message: "Voucher redeemed successfully",
      data: claim,
    });
  } catch (error) {
    console.error("[Redeem Voucher] Error redeeming voucher:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error redeeming voucher",
    });
  }
};

// GET /api/vendor/deals/:id/claims
// Lists voucher claims for a deal owned by this vendor (for auditing/analytics).
export const getDealClaims = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const deal = await Deal.findById(id).select("vendorId");
    if (!deal) {
      return res.status(404).json({ success: false, message: "Deal not found" });
    }

    if (deal.vendorId.toString() !== req.vendor.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view claims for this deal",
      });
    }

    const filter = { dealId: id };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await DealClaim.countDocuments(filter);
    const claims = await DealClaim.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: claims,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[Get Deal Claims] Error fetching claims:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching deal claims",
    });
  }
};
