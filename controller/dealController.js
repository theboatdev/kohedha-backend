import Deal from "../models/dealModel.js";
import cloudinary from "../config/cloudinary.js";

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
      question,
      rallyLocation,
    } = req.body;

    let tags = rawTags;
    if (typeof rawTags === "string") {
      try {
        tags = JSON.parse(rawTags);
      } catch {
        tags = rawTags ? [rawTags] : [];
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
      dealType: dealType || "regular",
      question: question || "",
      rallyLocation: rallyLocation ? parseInt(rallyLocation, 10) : undefined,
    });

    console.log(
      `[Create Deal] Successfully created deal: ${deal._id} - ${deal.dealName}`,
    );
    res.status(201).json({
      success: true,
      message: "Deal created successfully",
      data: deal,
    });
  } catch (error) {
    console.error("[Create Deal] Error creating deal:", error.message);
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
      data: deals,
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
      data: deal,
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
      question,
      rallyLocation,
    } = req.body;

    let tags = rawTags;
    if (typeof rawTags === "string") {
      try {
        tags = JSON.parse(rawTags);
      } catch {
        tags = rawTags ? [rawTags] : [];
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
    if (question !== undefined) deal.question = question;
    if (rallyLocation !== undefined)
      deal.rallyLocation = rallyLocation ? parseInt(rallyLocation, 10) : undefined;

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
      data: updatedDeal,
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
      data: deals,
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
      data: deals,
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
