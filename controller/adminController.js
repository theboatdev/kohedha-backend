import bcrypt from "bcrypt";
import Admin from "../models/adminModel.js";
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
