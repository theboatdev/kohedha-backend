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
