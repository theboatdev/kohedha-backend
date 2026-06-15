import Table from "../models/tableModel.js";
import Vendor from "../models/vendorModel.js";
import Section from "../models/sectionModel.js";

// Table creation by vendor
export const createTable = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { tableNumber, seatingCapacity, sectionId, shape } = req.body;

    // Basic validation
    if (!tableNumber || !seatingCapacity) {
      return res.status(400).json({
        success: false,
        message: "Table number & capacity required.",
      });
    }

    // Validate sectionId if provided
    if (sectionId) {
      const section = await Section.findOne({ _id: sectionId, vendorId });
      if (!section) {
        return res.status(400).json({
          success: false,
          message: "Invalid section ID or section not found",
        });
      }
    }

    const existingTable = await Table.findOne({ vendorId, tableNumber });
    if (existingTable) {
      return res.status(400).json({
        success: false,
        message: `A table with number - ${tableNumber} already exists`,
      });
    }

    const table = await Table.create({
      vendorId,
      tableNumber,
      seatingCapacity: seatingCapacity || 1,
      sectionId: sectionId || undefined,
      shape: shape || "square",
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Table created successfully",
      data: table,
    });
  } catch (error) {
    console.error("Create table error:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A table with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create table",
      error: error.message,
    });
  }
};

// Get all tables
export const getTables = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { sectionId } = req.query;

    // Build filter
    let filter = { vendorId };
    if (sectionId) {
      filter.sectionId = sectionId;
    }

    const tables = await Table.find(filter)
      .populate("sectionId", "sectionName sectionType")
      .sort({ createdAt: -1 });

    // Get counts
    const totalTables = tables.length;
    const activeTables = tables.filter((table) => table.isActive).length;
    const totalCapacity = tables
      .filter((table) => table.isActive)
      .reduce((sum, table) => sum + table.seatingCapacity, 0);

    res.status(200).json({
      success: true,
      count: totalTables,
      data: {
        tables,
        stats: {
          totalTables,
          activeTables,
          inactiveTables: totalTables - activeTables,
          totalCapacity,
        },
      },
    });
  } catch (error) {
    console.error("Get tables error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tables",
      error: error.message,
    });
  }
};

// Get table by ID
export const getTableById = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendor.id;

    const table = await Table.findOne({ _id: id, vendorId });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    res.status(200).json({
      success: true,
      data: table,
    });
  } catch (error) {
    console.error("Get table error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch table",
      error: error.message,
    });
  }
};

// Update table information
export const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendor.id;
    const {
      tableNumber,
      seatingCapacity,
      isActive,
      sectionId,
      shape,
      positionX,
      positionY,
    } = req.body;

    const table = await Table.findOne({ _id: id, vendorId });
    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Validate sectionId if provided
    if (sectionId !== undefined) {
      if (sectionId) {
        const section = await Section.findOne({ _id: sectionId, vendorId });
        if (!section) {
          return res.status(400).json({
            success: false,
            message: "Invalid section ID or section not found",
          });
        }
      }
    }

    // Check if new table name conflicts with another table
    if (tableNumber && tableNumber !== table.tableNumber) {
      const existingTable = await Table.findOne({
        vendorId,
        tableNumber,
        _id: { $ne: id },
      });

      if (existingTable) {
        return res.status(400).json({
          success: false,
          message: "A table with this name already exists",
        });
      }
    }

    // Update fields
    if (tableNumber !== undefined) table.tableNumber = tableNumber;
    if (seatingCapacity !== undefined) table.seatingCapacity = seatingCapacity;
    if (isActive !== undefined) table.isActive = isActive;
    if (sectionId !== undefined) table.sectionId = sectionId || null;
    if (shape !== undefined) table.shape = shape;
    if (positionX !== undefined) table.positionX = positionX;
    if (positionY !== undefined) table.positionY = positionY;

    await table.save();

    res.status(200).json({
      success: true,
      message: "Table updated successfully",
      data: table,
    });
  } catch (error) {
    console.error("Update table error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update table",
      error: error.message,
    });
  }
};

// Delete a table
export const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendor.id;

    const table = await Table.findOne({ _id: id, vendorId });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    await table.deleteOne();

    res.status(200).json({
      success: true,
      message: "Table deleted successfully",
    });
  } catch (error) {
    console.error("Delete table error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete table",
      error: error.message,
    });
  }
};

// Update table positions in bulk
export const updateTablePositions = async (req, res) => {
  try {
    const vendorId = req.vendor.id;
    const { positions } = req.body;

    // positions should be an array of { id, positionX, positionY }
    if (!Array.isArray(positions)) {
      return res.status(400).json({
        success: false,
        message: "Positions must be an array",
      });
    }

    // Update each table
    const updatePromises = positions.map(
      async ({ id, positionX, positionY }) => {
        const table = await Table.findOne({ _id: id, vendorId });
        if (table) {
          table.positionX = positionX;
          table.positionY = positionY;
          await table.save();
          return table;
        }
        return null;
      },
    );

    const updatedTables = await Promise.all(updatePromises);
    const successCount = updatedTables.filter((t) => t !== null).length;

    res.status(200).json({
      success: true,
      message: `Updated ${successCount} table positions`,
      data: {
        updated: successCount,
        total: positions.length,
      },
    });
  } catch (error) {
    console.error("Update positions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update table positions",
      error: error.message,
    });
  }
};
