import Waitlist from "../models/waitlistModel.js";

function validateSriLankanMobile(mobile) {
  const normalised = mobile.replace(/\s/g, "");
  return /^(\+94|0)\d{9}$/.test(normalised);
}

function validateGmail(email) {
  return /^[^\s@]+@gmail\.com$/.test(email.trim().toLowerCase());
}

export const createWaitlistEntry = async (req, res) => {
  try {
    const { name, email, mobile, userType, businessName, city } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!validateGmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid Gmail address (e.g. you@gmail.com)",
      });
    }

    if (!mobile?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    if (!validateSriLankanMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid Sri Lankan number (e.g. +94712345678 or 0712345678)",
      });
    }

    if (!userType || !["restaurant", "customer"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "Please select a user type (Restaurant or Customer)",
      });
    }

    if (userType === "restaurant") {
      if (!businessName?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Business name is required for restaurants",
        });
      }
      if (!city?.trim()) {
        return res.status(400).json({
          success: false,
          message: "City is required for restaurants",
        });
      }
    }

    const entry = await Waitlist.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      mobile: mobile.trim(),
      userType,
      businessName: userType === "restaurant" ? businessName.trim() : null,
      city: userType === "restaurant" ? city.trim() : null,
    });

    return res.status(201).json({
      success: true,
      message: "You're on the waitlist! We'll be in touch soon.",
      data: { id: entry._id },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This email is already on the waitlist",
      });
    }

    console.error("Waitlist submission error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};
