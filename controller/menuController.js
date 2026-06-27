import mongoose from "mongoose";
import Menu from "../models/menuModel.js";
import { parseCSV } from "../utils/csvParser.js";
import {
  validateMenuItem,
  validateCSVColumns,
} from "../utils/menuValidation.js";
import {
  createColumnMapping,
  transformRow,
  getSuggestedMappings,
} from "../utils/csvMapper.js";
import { extractMenuFromPDF } from "../utils/pdfMenuExtractor.js";
import cloudinary from "../config/cloudinary.js";

// Helper function to extract Cloudinary public_id from URL
const extractPublicId = (url) => {
  if (!url || !url.includes("cloudinary.com")) return null;
  try {
    // Extract public_id from Cloudinary URL
    // Format: https://res.cloudinary.com/{cloud_name}/image/upload/{transformations}/{public_id}.{format}
    const parts = url.split("/");
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex === -1) return null;

    // Get everything after 'upload/' (skip transformations if any)
    const afterUpload = parts.slice(uploadIndex + 1);
    // Skip transformation folders (they start with v_ or contain _ and numbers)
    const publicIdParts = afterUpload.filter(
      (part) => !part.startsWith("v") || part.includes("koheda"),
    );
    const publicIdWithExt = publicIdParts.join("/");

    // Remove file extension
    const publicId =
      publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf(".")) ||
      publicIdWithExt;
    return publicId;
  } catch (err) {
    console.error("Error extracting public_id:", err);
    return null;
  }
};

// Upload menu items via CSV with intelligent column mapping
export const uploadMenuCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const vendorId = req.vendor.id;

    const isPreviewMode = req.query.preview === "true";

    // Get custom mapping from request body (if provided)
    let customMapping = {};
    if (req.body.mapping) {
      try {
        customMapping =
          typeof req.body.mapping === "string"
            ? JSON.parse(req.body.mapping)
            : req.body.mapping;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: "Invalid mapping format. Expected JSON object.",
        });
      }
    }

    // Parse CSV
    let parsedRows;
    try {
      parsedRows = await parseCSV(req.file.buffer);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to parse CSV file",
        error: error.message || "Malformed CSV file",
      });
    }

    if (parsedRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty",
      });
    }

    // Get CSV headers from first row
    const csvHeaders = Object.keys(parsedRows[0]).filter(
      (key) => key !== "_rowNumber",
    );

    // Create column mapping (auto-detect + custom mapping)
    const mappingResult = createColumnMapping(csvHeaders, customMapping);

    // Check if all required fields are mapped
    if (mappingResult.missingRequired.length > 0) {
      const suggestions = getSuggestedMappings(mappingResult.unmappedColumns);

      return res.status(400).json({
        success: false,
        message: "Cannot proceed: Required fields are missing from CSV",
        missingFields: mappingResult.missingRequired,
        unmappedColumns: mappingResult.unmappedColumns,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        hint: 'Provide a custom mapping using the "mapping" parameter',
      });
    }

    // Transform rows using the mapping
    const transformedRows = parsedRows.map((row) =>
      transformRow(row, mappingResult.mapping),
    );

    // Process and validate each row
    const results = {
      totalRows: transformedRows.length,
      processedRows: 0,
      savedRows: 0,
      skippedRows: 0,
      errors: [],
    };

    const validItems = [];

    for (const row of transformedRows) {
      results.processedRows++;

      const validation = validateMenuItem(row, row._rowNumber);

      if (validation.isValid) {
        const menuItem = {
          ...validation.sanitizedData,
          vendorId,
        };
        validItems.push(menuItem);
      } else {
        results.skippedRows++;
        results.errors.push(...validation.errors);
      }
    }

    // Save to database if not in preview mode
    if (!isPreviewMode && validItems.length > 0) {
      try {
        await Menu.insertMany(validItems, { ordered: false });
        results.savedRows = validItems.length;
      } catch (error) {
        // Handle partial success (some items might fail due to DB constraints)
        if (error.writeErrors) {
          results.savedRows = validItems.length - error.writeErrors.length;
          error.writeErrors.forEach((err) => {
            results.errors.push(
              `Database error on item ${err.index + 1}: ${err.errmsg}`,
            );
          });
        } else {
          throw error;
        }
      }
    }

    // Prepare response
    const response = {
      success: true,
      message: isPreviewMode
        ? "CSV preview completed successfully"
        : "Menu upload completed",
      preview: isPreviewMode,
      mapping: {
        applied: mappingResult.mapping,
        unmappedColumns: mappingResult.unmappedColumns,
      },
      summary: {
        totalRows: results.totalRows,
        validRows: validItems.length,
        savedRows: isPreviewMode ? 0 : results.savedRows,
        skippedRows: results.skippedRows,
      },
    };

    // Include errors if any
    if (results.errors.length > 0) {
      response.errors = results.errors;
    }

    // Include preview data if in preview mode
    if (isPreviewMode) {
      response.previewData = validItems.slice(0, 10);
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Menu upload error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during menu upload",
      error: error.message,
    });
  }
};

// Analyze CSV file and return mapping suggestions without saving
export const analyzeCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Parse CSV file
    let parsedRows;
    try {
      parsedRows = await parseCSV(req.file.buffer);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to parse CSV file",
        error: error.message,
      });
    }

    if (parsedRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV file is empty",
      });
    }

    // Get CSV headers
    const csvHeaders = Object.keys(parsedRows[0]).filter(
      (key) => key !== "_rowNumber",
    );

    // Create auto-mapping
    const mappingResult = createColumnMapping(csvHeaders);

    // Get suggestions for unmapped columns
    const suggestions = getSuggestedMappings(mappingResult.unmappedColumns);

    // Sample data from first few rows
    const sampleData = parsedRows.slice(0, 3).map((row) => {
      const sample = {};
      csvHeaders.forEach((header) => {
        sample[header] = row[header];
      });
      return sample;
    });

    return res.status(200).json({
      success: true,
      message: "CSV analysis completed",
      analysis: {
        totalRows: parsedRows.length,
        columns: csvHeaders.length,
        detectedColumns: csvHeaders,
        autoMapping: mappingResult.mapping,
        unmappedColumns: mappingResult.unmappedColumns,
        missingRequiredFields: mappingResult.missingRequired,
        suggestions: suggestions,
        sampleData: sampleData,
        readyToUpload: mappingResult.missingRequired.length === 0,
      },
    });
  } catch (error) {
    console.error("CSV analysis error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to analyze CSV",
      error: error.message,
    });
  }
};

// Get Menu
export const getMenuItems = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { category, is_available } = req.query;

    const query = { vendorId };
    if (category) query.category = category;
    if (is_available !== undefined)
      query.is_available = is_available === "true";

    const menuItems = await Menu.find(query).sort({ category: 1, name: 1 });

    return res.status(200).json({
      success: true,
      count: menuItems.length,
      data: menuItems,
    });
  } catch (error) {
    console.error("Get menu items error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve menu items",
      error: error.message,
    });
  }
};

// Update Menu Item
export const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendor.id;
    const updates = { ...req.body };

    // If a new image was uploaded, use Cloudinary URL
    if (req.file) {
      updates.image = req.file.path; // Cloudinary provides the full URL in req.file.path
    }

    const existing = await Menu.findOne({ _id: id, vendorId });

    if (!existing) {
      // Clean up newly uploaded Cloudinary file since item wasn't found
      if (req.file) {
        try {
          const publicId = extractPublicId(req.file.path);
          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (err) {
          console.error("Error deleting Cloudinary image:", err);
        }
      }
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    // Delete old image from Cloudinary if it's being replaced
    if (req.file && existing.image) {
      try {
        const publicId = extractPublicId(existing.image);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (err) {
        console.error("Error deleting old Cloudinary image:", err);
      }
    }

    const menuItem = await Menu.findOneAndUpdate(
      { _id: id, vendorId },
      updates,
      { new: true, runValidators: true },
    );

    return res.status(200).json({
      success: true,
      data: menuItem,
    });
  } catch (error) {
    console.error("Update menu item error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update menu item",
      error: error.message,
    });
  }
};

// Delete Menu Item
export const deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendor.id;

    const menuItem = await Menu.findOneAndDelete({ _id: id, vendorId });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    // Delete image from Cloudinary if it exists
    if (menuItem.image) {
      try {
        const publicId = extractPublicId(menuItem.image);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (err) {
        console.error("Error deleting Cloudinary image:", err);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    console.error("Delete menu item error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete menu item",
      error: error.message,
    });
  }
};

// Upload menu PDF
export const uploadMenuPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only PDF files are accepted.",
      });
    }

    const vendorId = req.vendor.id;
    const isPreviewMode = req.query.preview !== "false"; // Default to preview

    // Extract menu items from PDF using Gemini
    let extractionResult;
    try {
      extractionResult = await extractMenuFromPDF(req.file.buffer);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to extract menu from PDF",
        error: error.message,
        hint: "Ensure the PDF contains readable text. Scanned images may require OCR processing.",
      });
    }

    const { items, totalItems, pages } = extractionResult;

    if (totalItems === 0) {
      return res.status(400).json({
        success: false,
        message: "No menu items could be extracted from the PDF",
        hint: "Please check if the PDF contains a valid menu with prices and item names.",
      });
    }

    // Validate extracted items using existing validation
    const validationResults = {
      totalItems,
      validItems: 0,
      invalidItems: 0,
      errors: [],
    };

    const validItems = [];

    items.forEach((item, index) => {
      const validation = validateMenuItem(item, index + 1);

      if (validation.isValid) {
        validItems.push({
          ...validation.sanitizedData,
          vendorId,
        });
        validationResults.validItems++;
      } else {
        validationResults.invalidItems++;
        validationResults.errors.push({
          row: index + 1,
          item: item.name,
          errors: validation.errors,
        });
      }
    });

    // Return extracted data for user review
    if (isPreviewMode) {
      return res.status(200).json({
        success: true,
        message: "PDF menu extracted successfully. Review the items below.",
        preview: true,
        data: {
          filename: req.file.originalname,
          pages,
          totalExtracted: totalItems,
          validItems: validationResults.validItems,
          invalidItems: validationResults.invalidItems,
          items: validItems, // Send valid items for preview
          errors: validationResults.errors,
        },
        hint: "Review and edit the items, then submit.",
      });
    }

    // SAVE MODE: Persist to database
    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid menu items to save",
        errors: validationResults.errors,
      });
    }

    try {
      const savedItems = await Menu.insertMany(validItems, { ordered: false });

      return res.status(201).json({
        success: true,
        message: `Successfully saved ${savedItems.length} menu items`,
        preview: false,
        data: {
          savedCount: savedItems.length,
          totalExtracted: totalItems,
          skipped: validationResults.invalidItems,
          errors:
            validationResults.errors.length > 0
              ? validationResults.errors
              : undefined,
        },
      });
    } catch (dbError) {
      // Handle partial success
      if (dbError.writeErrors) {
        const successCount = validItems.length - dbError.writeErrors.length;
        return res.status(207).json({
          // 207 Multi-Status
          success: true,
          message: `Partially saved: ${successCount} of ${validItems.length} items`,
          data: {
            savedCount: successCount,
            totalExtracted: totalItems,
            errors: dbError.writeErrors.map((err) => ({
              item: validItems[err.index].name,
              error: err.errmsg,
            })),
          },
        });
      }
      throw dbError;
    }
  } catch (error) {
    console.error("PDF upload error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during PDF processing",
      error: error.message,
    });
  }
};

// Save scanned PDF menu items
export const saveEditedPDFMenuItems = async (req, res) => {
  try {
    const { items } = req.body;
    const vendorId = req.vendor.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items provided to save",
      });
    }

    // Validate each item
    const validItems = [];
    const errors = [];

    items.forEach((item, index) => {
      const validation = validateMenuItem(item, index + 1);

      if (validation.isValid) {
        validItems.push({
          ...validation.sanitizedData,
          vendorId,
        });
      } else {
        errors.push({
          row: index + 1,
          item: item.name,
          errors: validation.errors,
        });
      }
    });

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid items to save",
        errors,
      });
    }

    // Save to database
    try {
      const savedItems = await Menu.insertMany(validItems, { ordered: false });

      return res.status(201).json({
        success: true,
        message: `Successfully saved ${savedItems.length} menu items`,
        data: {
          savedCount: savedItems.length,
          totalSubmitted: items.length,
          skipped: errors.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (dbError) {
      if (dbError.writeErrors) {
        const successCount = validItems.length - dbError.writeErrors.length;
        return res.status(207).json({
          success: true,
          message: `Partially saved: ${successCount} of ${validItems.length} items`,
          data: {
            savedCount: successCount,
            errors: dbError.writeErrors.map((err) => ({
              item: validItems[err.index].name,
              error: err.errmsg,
            })),
          },
        });
      }
      throw dbError;
    }
  } catch (error) {
    console.error("Save edited items error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while saving items",
      error: error.message,
    });
  }
};

// Create a single menu item (with optional image)
export const createMenuItem = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { category, name, description, price, currency, is_available } =
      req.body;

    // Basic required-field validation
    if (
      !category ||
      !name ||
      price === undefined ||
      price === null ||
      price === ""
    ) {
      // Clean up uploaded Cloudinary file if validation fails
      if (req.file) {
        try {
          const publicId = extractPublicId(req.file.path);
          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (err) {
          console.error("Error deleting Cloudinary image:", err);
        }
      }
      return res.status(400).json({
        success: false,
        message: "category, name, and price are required",
      });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      if (req.file) {
        try {
          const publicId = extractPublicId(req.file.path);
          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (err) {
          console.error("Error deleting Cloudinary image:", err);
        }
      }
      return res.status(400).json({
        success: false,
        message: "price must be a non-negative number",
      });
    }

    const imageUrl = req.file ? req.file.path : null; // Cloudinary URL

    const menuItem = await Menu.create({
      vendorId,
      category: category.trim(),
      name: name.trim(),
      description: description ? description.trim() : "",
      price: parsedPrice,
      currency: currency ? currency.toUpperCase() : "LKR",
      is_available:
        is_available !== undefined
          ? is_available === "true" || is_available === true
          : true,
      image: imageUrl,
    });

    return res.status(201).json({
      success: true,
      message: "Menu item created successfully",
      data: menuItem,
    });
  } catch (error) {
    // Clean up uploaded Cloudinary file on unexpected error
    if (req.file) {
      try {
        const publicId = extractPublicId(req.file.path);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (err) {
        console.error("Error deleting Cloudinary image:", err);
      }
    }
    console.error("Create menu item error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create menu item",
      error: error.message,
    });
  }
};

// GET /api/vendor/menu/votes
// Returns per-item upvote/downvote summary for the authenticated vendor.
// The voters[] array is intentionally excluded (contains consumer Firebase UIDs).
// Query params:
//   sortBy  = "upvotes" (default) | "downvotes" | "net" | "category"
//   category = filter to a single category
export const getMenuVoteSummary = async (req, res) => {
  try {
    const vendorId = new mongoose.Types.ObjectId(req.vendor.id);
    const { category, sortBy = "upvotes" } = req.query;

    const match = { vendorId };
    if (category) match.category = category;

    const sortMap = {
      upvotes:   { upvotes: -1, name: 1 },
      downvotes: { downvotes: -1, name: 1 },
      net:       { netVotes: -1, name: 1 },
      category:  { category: 1, name: 1 },
    };
    const sortStage = sortMap[sortBy] ?? sortMap.upvotes;

    const [result] = await Menu.aggregate([
      { $match: match },
      {
        $addFields: {
          netVotes: { $subtract: ["$upvotes", "$downvotes"] },
        },
      },
      { $sort: sortStage },
      {
        $group: {
          _id: null,
          totalUpvotes: { $sum: "$upvotes" },
          totalDownvotes: { $sum: "$downvotes" },
          items: {
            $push: {
              _id: "$_id",
              name: "$name",
              category: "$category",
              upvotes: "$upvotes",
              downvotes: "$downvotes",
              netVotes: "$netVotes",
              is_available: "$is_available",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalUpvotes: 1,
          totalDownvotes: 1,
          itemCount: { $size: "$items" },
          items: 1,
        },
      },
    ]);

    // If the vendor has no menu items yet, return zeros
    if (!result) {
      return res.status(200).json({
        success: true,
        data: {
          totalUpvotes: 0,
          totalDownvotes: 0,
          itemCount: 0,
          items: [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get menu vote summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve menu vote summary",
      error: error.message,
    });
  }
};
