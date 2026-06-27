import { generateToken } from "../utils/jwtToken.js";

// Google OAuth Callback
export const googleCallback = (req, res) => {
  try {
    const vendor = req.user;

    const token = generateToken(vendor._id);

    // Set token in HTTP-only cookie
    const cookieOptions = {
      expires: new Date(
        Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000,
      ),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    };

    res.cookie("token", token, cookieOptions);

    // Redirect based on registration step
    let redirectUrl;

    if (vendor.registrationStep === 0 || vendor.registrationStep === 1) {
      redirectUrl = `${process.env.FRONTEND_URL}/vendors/register/step-2`;
    } else if (vendor.registrationStep === 2) {
      redirectUrl = `${process.env.FRONTEND_URL}/vendors/register/step-3`;
    } else {
      redirectUrl = `${process.env.FRONTEND_URL}/vendors/dashboard`;
    }

    res.redirect(`${redirectUrl}?token=${token}`);
  } catch (error) {
    console.error("Google callback error: ", error);
    res.redirect(`${process.env.FRONTEND_URL}/vendors/login?error=auth_failed`);
  }
};

// Google Auth Failure
export const googleAuthFailure = (req, res) => {
  res.redirect(
    `${process.env.FRONTEND_URL}/vendors/login?error=google_auth_failed`,
  );
};
