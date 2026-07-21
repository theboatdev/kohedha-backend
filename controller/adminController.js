import bcrypt from "bcrypt";
import Admin from "../models/adminModel.js";
import RallySubmission from "../models/rallySubmissionModel.js";
import { sendAdminTokenResponse } from "../utils/jwtToken.js";

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

// Create a new MMR admin (super_admin only)
export const createAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An admin with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await Admin.create({
      email,
      password: hashedPassword,
      name: name?.trim() || undefined,
      role: "mmr_admin",
    });

    const adminData = await Admin.findById(admin._id).select("-password");

    res.status(201).json({
      success: true,
      message: "MMR admin created successfully",
      data: adminData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create admin",
      error: error.message,
    });
  }
};

// List all admins (super_admin only)
export const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch admins",
      error: error.message,
    });
  }
};

// Toggle isActive status of an admin (super_admin only)
export const toggleAdminStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id).select("-password");
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Prevent super_admin from deactivating themselves or other super_admins
    if (admin.role === "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Super admin accounts cannot be deactivated via this endpoint",
      });
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    res.status(200).json({
      success: true,
      message: `Admin ${admin.isActive ? "activated" : "deactivated"} successfully`,
      data: admin,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update admin status",
      error: error.message,
    });
  }
};

// Get MMR rally submissions (super_admin + mmr_admin)
// Optional query params: location=1|2|3, page, limit
export const getRallySubmissions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.location) {
      const loc = parseInt(req.query.location);
      if ([1, 2, 3].includes(loc)) {
        filter.location = loc;
      }
    }

    const [submissions, total] = await Promise.all([
      RallySubmission.find(filter)
        .populate("dealId", "dealName rallyLocation")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RallySubmission.countDocuments(filter),
    ]);

    // Per-checkpoint counts for summary stats
    const checkpointCounts = await RallySubmission.aggregate([
      { $group: { _id: "$location", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: submissions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      checkpointStats: checkpointCounts.reduce((acc, c) => {
        acc[c._id] = c.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch rally submissions",
      error: error.message,
    });
  }
};
