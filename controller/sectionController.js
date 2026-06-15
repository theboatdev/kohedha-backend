import Section from "../models/sectionModel.js";
import Vendor from "../models/vendorModel.js";
import Table from "../models/tableModel.js";

// Create section
export const createSection = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { sectionName, sectionType, description } = req.body;

    if (!sectionName) {
      return res.status(400).json({
        success: false,
        message: "Section name is required.",
      });
    }

    // Check if section with same name already exists for this vendor
    const existingSection = await Section.findOne({ vendorId, sectionName });
    if (existingSection) {
      return res.status(400).json({
        success: false,
        message: `A section with name '${sectionName}' already exists`,
      });
    }

    const section = await Section.create({
      vendorId,
      sectionName,
      sectionType: sectionType || "indoor",
      description: description || "",
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: section,
    });
  } catch (error) {
    console.error("Create section error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A section with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get all sections for a vendor
export const getSections = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { isActive } = req.query;

    let filter = { vendorId };

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const sections = await Section.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: sections.length,
      data: sections,
    });
  } catch (error) {
    console.error("Get sections error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Get single section by ID
export const getSectionById = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;

    const section = await Section.findOne({ _id: id, vendorId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    res.status(200).json({
      success: true,
      data: section,
    });
  } catch (error) {
    console.error("Get section error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Update section
export const updateSection = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;
    const { sectionName, sectionType, description, isActive } = req.body;

    const section = await Section.findOne({ _id: id, vendorId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    // Check for duplicate name if changing name
    if (sectionName && sectionName !== section.sectionName) {
      const existingSection = await Section.findOne({ vendorId, sectionName });
      if (existingSection) {
        return res.status(400).json({
          success: false,
          message: `A section with name '${sectionName}' already exists`,
        });
      }
    }

    // Update fields
    if (sectionName) section.sectionName = sectionName;
    if (sectionType) section.sectionType = sectionType;
    if (description !== undefined) section.description = description;
    if (isActive !== undefined) section.isActive = isActive;

    await section.save();

    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      data: section,
    });
  } catch (error) {
    console.error("Update section error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A section with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Delete section
export const deleteSection = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { id } = req.params;

    const section = await Section.findOne({ _id: id, vendorId });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    // Check if section has tables
    const tablesInSection = await Table.countDocuments({
      sectionId: id,
      vendorId,
    });
    if (tablesInSection > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete section. It contains ${tablesInSection} table(s). Please remove or reassign the tables first.`,
      });
    }

    await Section.deleteOne({ _id: id });

    res.status(200).json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (error) {
    console.error("Delete section error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
