import jwt from "jsonwebtoken";

export const sendTokenResponse = (
  vendor,
  statusCode,
  res,
  message = "Success",
) => {
  const token = generateToken(vendor._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };

  res
    .status(statusCode)
    .cookie("token", token, cookieOptions)
    .json({
      success: true,
      message,
      data: {
        _id: vendor._id,
        email: vendor.email,
        companyName: vendor.companyName,
        registrationStep: vendor.registrationStep,
      },
      token,
    });
};

export const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Admin token - identified by `type: "admin"` so auth middleware can tell
// admin sessions apart from vendor sessions.
export const generateAdminToken = (adminId) => {
  return jwt.sign(
    { type: "admin", adminId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRE || process.env.JWT_EXPIRE },
  );
};

export const sendAdminTokenResponse = (
  admin,
  statusCode,
  res,
  message = "Success",
) => {
  const token = generateAdminToken(admin._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };

  res
    .status(statusCode)
    .cookie("admin_token", token, cookieOptions)
    .json({
      success: true,
      message,
      data: {
        _id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      token,
    });
};
// Impersonation token - carries BOTH identities:
//  - `id`: the target vendor's id (so every existing req.vendor.id check
//    in controllers keeps working unmodified)
//  - `adminId`: who is actually driving the session (for audit + banner)
export const generateImpersonationToken = (vendorID, adminId) => {
  return jwt.sign(
    { type: "impersonation", id: vendorID, adminId, impersonating: true },
    process.env.JWT_SECRET,
    { expiresIn: process.env.IMPERSONATION_JWT_EXPIRE || "1h" },
  );
};
