import bcrypt from "bcrypt";
import Admin from "../models/adminModel.js";
import AuditLog from "../models/auditLogModel.js";
import Vendor from "../models/vendorModel.js";
import {
  sendAdminTokenResponse,
  generateImpersonationToken,
} from "../utils/jwtToken.js";

// Admin login
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
      });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({
        success: false,
        message: "Admin account not found",
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "This admin account has been deactivated",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    sendAdminTokenResponse(admin, 200, res, "Login successful");
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

// Admin logout
export const adminLogout = async (req, res) => {
  try {
    res.cookie("admin_token", "none", {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
};

// Get currently logged in admin
export const getCurrentAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin",
      error: error.message,
    });
  }
};

// Get /api/admin/vendors
export const listVendors = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search
      ? {
          $or: [
            { email: { $regex: search, $options: "i" } },
            { companyName: { $regex: search, $options: "i" } },
          ],
        }
      : {};
    const vendors = await Vendor.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Vendor.countDocuments(query);
    res.status(200).json({
      success: true,
      data: vendors,
      pagination: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to list vendors",
      error: error.message,
    });
  }
};

// POST /api/admin/vendors/:id/impersonate
export const startImpersonation = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id).select("-password");

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    const token = generateImpersonationToken(vendor._id, req.admin._id);

    await AuditLog.create({
      adminId: req.admin._id,
      vendorId: vendor._id,
      action: "impersonation.start",
    });

    res.status(200).json({
      success: true,
      message: `Impersonation session started for ${vendor.email}`,
      impersonationToken: token,
      data: {
        _id: vendor._id,
        email: vendor.email,
        companyName: vendor.companyName,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to start impersonation",
      error: error.message,
    });
  }
};

// POST /api/admin/impersonate/end  (called with the impersonation token, not the admin token)
export const endImpersonation = async (req, res) => {
  try {
    if (!req.impersonation?.isImpersonating) {
      return res
        .status(400)
        .json({ success: false, message: "No active impersonation session" });
    }
    await AuditLog.create({
      adminId: req.impersonation.adminId,
      vendorId: req.vendor._id,
      action: "impersonation.end",
    });
    res.status(200).json({
      success: true,
      message: `Impersonation session ended for ${req.vendor.email}`,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to end impersonation",
        error: error.message,
      });
  }
};
