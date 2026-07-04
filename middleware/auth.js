import jwt from "jsonwebtoken";
import Vendor from "../models/vendorModel.js";
import Admin from "../models/adminModel.js";
import AuditLog from "../models/auditLogModel.js";
import ImpersonationSession from "../models/impersonationSessionModel.js";
import { getImpersonationJwtSecret } from "../utils/jwtToken.js";

// Impersonation tokens are signed with their own secret (see jwtToken.js),
// so they can be rotated/invalidated independently of vendor/admin sessions.
// We can't know a token's type without decoding it first, and decoding
// (unlike verifying) doesn't check the signature, so this peek is safe -
// the actual signature check still happens in `jwt.verify` below with the
// secret picked here.
const verifyAuthToken = (token) => {
  const unverified = jwt.decode(token);
  const secret =
    unverified?.type === "impersonation"
      ? getImpersonationJwtSecret()
      : process.env.JWT_SECRET;
  return jwt.verify(token, secret);
};

/* Shared by `authenticate` and `protect`: once a token decodes as an
impersonation token, confirm the underlying session hasn't been revoked
 (via `endImpersonation`) or otherwise made inactive. Without this check
 a "ended" impersonation JWT would stay usable until it naturally expires. */
const loadActiveImpersonationSession = async (decoded) => {
  if (decoded.type !== "impersonation") return null;

  const session = await ImpersonationSession.findOne({
    jti: decoded.jti,
    active: true,
  });

  if (!session) {
    const err = new Error("Impersonation session has been ended");
    err.name = "ImpersonationRevokedError";
    throw err;
  }

  return { isImpersonating: true, adminId: decoded.adminId, jti: decoded.jti };
};

// Basic auth - allows incomplete registration
export const authenticate = async (req, res, next) => {
  try {
    let token;

    if (req.cookies.impersonation_token) {
      token = req.cookies.impersonation_token;
    } else if (req.cookies.token) {
      token = req.cookies.token;
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided",
      });
    }

    const decoded = verifyAuthToken(token);
    req.vendor = await Vendor.findById(decoded.id).select("-password");

    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    req.impersonation = await loadActiveImpersonationSession(decoded);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    if (error.name === "ImpersonationRevokedError") {
      return res.status(401).json({
        success: false,
        message: "Impersonation session has ended, please log in again",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }
};

// Requires a valid admin JWT (type: "admin"). Sets req.admin.
export const requireAdmin = async (req, res, next) => {
  try {
    let token;

    if (req.cookies.admin_token) {
      token = req.cookies.admin_token;
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    req.admin = await Admin.findById(decoded.adminId).select("-password");

    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (!req.admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "This admin account has been deactivated",
      });
    }

    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }
};

// Protect - requires complete registration
export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.cookies.impersonation_token) {
      token = req.cookies.impersonation_token;
    } else if (req.cookies.token) {
      token = req.cookies.token;
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided",
      });
    }

    const decoded = verifyAuthToken(token);
    req.vendor = await Vendor.findById(decoded.id).select("-password");

    if (!req.vendor) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Check registration step
    if (req.vendor.registrationStep < 3 || !req.vendor.isProfileComplete) {
      return res.status(403).json({
        success: false,
        message: "Please complete your registration first",
        registrationStep: req.vendor.registrationStep,
      });
    }

    req.impersonation = await loadActiveImpersonationSession(decoded);

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    if (error.name === "ImpersonationRevokedError") {
      return res.status(401).json({
        success: false,
        message: "Impersonation session has ended, please log in again",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }
};

// Best-effort: audit writes must never crash the request they're logging,
// so failures here can only be handled after the fact (retry + loud log).
// Wire `onCriticalAuditFailure` up to a real alerting channel (Sentry/Slack/
// PagerDuty/etc.) - as-is it's a single choke point that's easy to extend
// without touching every call site.
const onCriticalAuditFailure = (entry, error) => {
  console.error(
    "CRITICAL: audit log write failed after retries - impersonated action was NOT recorded:",
    JSON.stringify(entry),
    error,
  );
};

const createAuditLogWithRetry = async (entry, attemptsLeft = 2) => {
  try {
    await AuditLog.create(entry);
  } catch (error) {
    if (attemptsLeft > 1) {
      return createAuditLogWithRetry(entry, attemptsLeft - 1);
    }
    onCriticalAuditFailure(entry, error);
  }
};

// Logs mutating requests made while an admin is impersonating a vendor.
// Must run AFTER `protect`/`authenticate` (needs req.vendor + req.impersonation).
export const auditWrites = (req, res, next) => {
  if (!req.impersonation?.isImpersonating || req.method === "GET") {
    return next();
  }
  res.on("finish", () => {
    createAuditLogWithRetry({
      adminId: req.impersonation.adminId,
      vendorId: req.vendor._id,
      action: "request",
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
    });
  });
  next();
};
