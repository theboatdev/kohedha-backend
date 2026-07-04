import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import Admin from "../models/adminModel.js";
import AuditLog from "../models/auditLogModel.js";
import Vendor from "../models/vendorModel.js";
import ImpersonationSession from "../models/impersonationSessionModel.js";
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

// Escapes regex metacharacters so user-supplied search text is always
// treated as a literal substring, never as regex syntax (prevents ReDoS
// via pathological patterns like "(a+)+").
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Get /api/admin/vendors
export const listVendors = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

    const query = search
      ? {
          $or: [
            { email: { $regex: escapeRegex(search), $options: "i" } },
            { companyName: { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {};
    const vendors = await Vendor.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);
    const total = await Vendor.countDocuments(query);
    res.status(200).json({
      success: true,
      data: vendors,
      pagination: { total, page: pageNum, limit: limitNum },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to list vendors",
      error: error.message,
    });
  }
};

// GET /api/admin/audit-logs
// Optional filters: vendorId, adminId, action. Paginated, newest first.
export const listAuditLogs = async (req, res) => {
  try {
    const { vendorId, adminId, action, page = 1, limit = 50 } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));

    if (vendorId && !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid vendorId" });
    }
    if (adminId && !mongoose.Types.ObjectId.isValid(adminId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid adminId" });
    }

    const query = {};
    if (vendorId) query.vendorId = vendorId;
    if (adminId) query.adminId = adminId;
    if (action) query.action = action;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate("adminId", "name email")
        .populate("vendorId", "email companyName")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      AuditLog.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: { total, page: pageNum, limit: limitNum },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to list audit logs",
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

    const jti = uuidv4();
    const token = generateImpersonationToken(vendor._id, req.admin._id, jti);
    // Decode (no need to re-verify, we just signed it) to get the exact
    // expiry so the session record and JWT stay in sync.
    const { exp } = jwt.decode(token);

    await ImpersonationSession.create({
      jti,
      adminId: req.admin._id,
      vendorId: vendor._id,
      expiresAt: new Date(exp * 1000),
    });

    await AuditLog.create({
      adminId: req.admin._id,
      vendorId: vendor._id,
      action: "impersonation.start",
      metadata: req.body?.reason ? { reason: req.body.reason } : undefined,
    });

    // Set as an httpOnly cookie (preferred, XSS-resistant) in addition to
    // returning it in the body (kept for clients that can't rely on cookies,
    // e.g. a separate-origin admin SPA embedding the vendor app). Frontends
    // that can use the cookie should avoid persisting the body token in JS
    // state (localStorage, memory) to get the httpOnly protection.
    res.cookie("impersonation_token", token, {
      expires: new Date(exp * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
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

// POST /api/vendor/impersonate/end  (called with the impersonation token, not the admin token)
// Mounted behind `authenticate` (not `protect`) so it works even if the
// impersonated vendor hasn't finished onboarding yet.
export const endImpersonation = async (req, res) => {
  try {
    if (!req.impersonation?.isImpersonating) {
      return res
        .status(400)
        .json({ success: false, message: "No active impersonation session" });
    }

    // Actually revoke the session server-side - without this the JWT would
    // stay valid until its natural expiry even after "ending" the session.
    const session = await ImpersonationSession.findOneAndUpdate(
      { jti: req.impersonation.jti, active: true },
      { active: false, endedAt: new Date() },
    );

    if (!session) {
      return res.status(400).json({
        success: false,
        message: "Impersonation session already ended or invalid",
      });
    }

    await AuditLog.create({
      adminId: req.impersonation.adminId,
      vendorId: req.vendor._id,
      action: "impersonation.end",
    });

    res.cookie("impersonation_token", "none", {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: `Impersonation session ended for ${req.vendor.email}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to end impersonation",
      error: error.message,
    });
  }
};
