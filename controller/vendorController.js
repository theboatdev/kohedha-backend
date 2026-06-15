import Vendor from "../models/vendorModel.js";
import bcrypt from "bcrypt";
import { validatePassword } from "../utils/validation.js";
import { validateCoordinates } from "../utils/coordinates.js";
import { sendTokenResponse, generateToken } from "../utils/jwtToken.js";

// Vendor Registration
export const registerVendor = async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields..",
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors.join(", "),
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords doesn't match..",
      });
    }

    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ message: "Email already registered.." });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const vendor = new Vendor({
      email,
      password: hashedPassword,
      authProvider: "local",
      registrationStep: 1,
    });

    const token = generateToken(vendor._id);

    await vendor.save();

    sendTokenResponse(vendor, 201, res, "Vendor registred successfully");
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Registration failed!! ",
      error: error.message,
    });
  }
};

/**
 * PUT /api/vendor/profile/complete
 *
 * Progresses a vendor through the multi-step registration flow.
 * Requires a valid JWT (authenticate middleware).
 *
 * Step 2 body:
 *   { currentStep: 2, companyName, vendorMobile, businessCategory, businessRegistrationNo? }
 *
 * Step 3 body:
 *   {
 *     currentStep: 3,
 *     location: {
 *       coordinates: { lat: number, lng: number },  // required — set via map picker
 *       streetAddress?: string,
 *       city?: string,
 *       district?: string,
 *       postalCode?: string,
 *       country?: string,
 *     },
 *     website?: string,
 *     description?: string,
 *   }
 *
 * On success returns { success: true, message, data: { _id, email, companyName, isProfileComplete } }.
 */
export const compeleteRegistration = async (req, res) => {
  try {
    const {
      companyName,
      businessRegistrationNo,
      vendorMobile,
      businessCategory,
      location,
      website,
      description,
      currentStep,
    } = req.body;

    const vendor = await Vendor.findById(req.vendor.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Step 2: Business Details
    if (currentStep === 2) {
      if (!companyName || !vendorMobile || !businessCategory) {
        return res.status(400).json({
          success: false,
          message:
            "Company name, vendor mobile, and business category are required",
        });
      }

      vendor.companyName = companyName;
      vendor.businessRegistrationNo =
        businessRegistrationNo || vendor.businessRegistrationNo;
      vendor.vendorMobile = vendorMobile;
      vendor.businessCategory = businessCategory;
      vendor.registrationStep = 2;
    }

    // Step 3: Location & Additional Info
    if (currentStep === 3) {
      const coords = location?.coordinates;
      const coordValidation = validateCoordinates(coords?.lat, coords?.lng);
      if (!coordValidation.valid) {
        return res.status(400).json({
          success: false,
          message: coordValidation.message,
        });
      }

      let updatedLocation = vendor.location
        ? { ...vendor.location }
        : undefined;

      if (location) {
        updatedLocation = updatedLocation || {};

        if (location.businessName) {
          updatedLocation.businessName = location.businessName;
        }
        if (location.streetAddress) {
          updatedLocation.streetAddress = location.streetAddress;
        }
        if (location.city) {
          updatedLocation.city = location.city;
        }
        if (location.district) {
          updatedLocation.district = location.district;
        }
        if (location.postalCode) {
          updatedLocation.postalCode = location.postalCode;
        }
        if (location.country) {
          updatedLocation.country = location.country;
        }
        if (location.coordinates) {
          updatedLocation.coordinates = {
            ...updatedLocation.coordinates,
            ...location.coordinates,
          };
        }
      }

      if (updatedLocation) {
        vendor.location = updatedLocation;
      }
      vendor.website = website || vendor.website;
      vendor.description = description || vendor.description;
      vendor.registrationStep = 3;
      vendor.isProfileComplete = true;
      vendor.profileCompletedAt = new Date();
    }

    await vendor.save();

    res.status(200).json({
      success: true,
      message: `Registration completed successfully`,
      data: {
        _id: vendor._id,
        email: vendor.email,
        companyName: vendor.companyName,
        isProfileComplete: vendor.isProfileComplete,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to complete the registration",
      error: error.message,
    });
  }
};

// Vendor Login
export const vendorLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
      });
    }

    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(400).json({
        success: false,
        message: "User account not found",
      });
    }

    if (vendor.authProvider === "google") {
      return res
        .status(400)
        .json({ success: false, message: "Please sign in with Google" });
    }

    const isPasswordValid = await bcrypt.compare(password, vendor.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid Password!!",
      });
    }

    sendTokenResponse(vendor, 200, res, "Login successfull");
  } catch (error) {
    res.status(500).json({ message: "Login failed!! ", error: error.message });
  }
};

// Vendor logout
export const vendorLogout = async (req, res) => {
  try {
    res.cookie("token", "none", {
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

// Get currently logged in vendor
export const getCurrentVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id).select("-password");

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch vendor",
      error: error.message,
    });
  }
};

// Update/Get vendor details after registration
export const completeVendorProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      companyName,
      businessRegistrationNo,
      vendorMobile,
      location,
      businessCategory,
      website,
      description,
    } = req.body;

    if (!companyName || !vendorMobile) {
      return res.status(400).json({
        success: false,
        message: "Company name and vendor mobile are required",
      });
    }

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      res.status(404).json({
        success: false,
        message: "Vendor not found..",
      });
    }

    // Update details
    vendor.companyName = companyName || vendor.companyName;
    vendor.businessRegistrationNo =
      businessRegistrationNo || vendor.businessRegistrationNo;
    vendor.vendorMobile = vendorMobile || vendor.vendorMobile;
    vendor.businessCategory = businessCategory || vendor.businessCategory;
    vendor.website = website || vendor.website;
    vendor.description = description || vendor.description;
    if (location) {
      const updatedLocation = vendor.location ? { ...vendor.location } : {};

      if (location.businessName) {
        updatedLocation.businessName = location.businessName;
      }
      if (location.streetAddress) {
        updatedLocation.streetAddress = location.streetAddress;
      }
      if (location.city) {
        updatedLocation.city = location.city;
      }
      if (location.district) {
        updatedLocation.district = location.district;
      }
      if (location.postalCode) {
        updatedLocation.postalCode = location.postalCode;
      }
      if (location.country) {
        updatedLocation.country = location.country;
      }
      if (location.coordinates) {
        updatedLocation.coordinates = {
          ...updatedLocation.coordinates,
          ...location.coordinates,
        };
      }

      vendor.location = updatedLocation;
    }

    // Mark profile as complete
    vendor.isProfileComplete = true;
    vendor.profileCompletedAt = new Date();

    await vendor.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        _id: vendor._id,
        email: vendor.email,
        companyName: vendor.companyName,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Profile update failed!!",
      error: error.message,
    });
  }
};

// Get venue details
export const getVenueDetails = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor.id)
      .select("-password")
      .lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Transform location to include latitude and longitude from coordinates
    const location = vendor.location || {};

    // Convert coordinates to latitude/longitude if they exist
    if (location.coordinates) {
      if (
        location.coordinates.lat !== undefined &&
        location.coordinates.lat !== null
      ) {
        location.latitude = location.coordinates.lat.toString();
      }
      if (
        location.coordinates.lng !== undefined &&
        location.coordinates.lng !== null
      ) {
        location.longitude = location.coordinates.lng.toString();
      }
    }

    // Ensure we always return latitude and longitude fields, even if empty
    if (!location.latitude) location.latitude = "";
    if (!location.longitude) location.longitude = "";

    res.status(200).json({
      success: true,
      data: {
        companyName: vendor.companyName,
        email: vendor.email,
        businessRegistrationNo: vendor.businessRegistrationNo,
        vendorMobile: vendor.vendorMobile,
        businessCategory: vendor.businessCategory,
        website: vendor.website,
        description: vendor.description,
        location,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch venue details",
      error: error.message,
    });
  }
};

// Update venue details (business and location information)
export const updateVenueDetails = async (req, res) => {
  try {
    const {
      companyName,
      businessRegistrationNo,
      vendorMobile,
      businessCategory,
      website,
      description,
      location,
    } = req.body;

    const vendor = await Vendor.findById(req.vendor.id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Update business details
    if (companyName) vendor.companyName = companyName;
    if (businessRegistrationNo)
      vendor.businessRegistrationNo = businessRegistrationNo;
    if (vendorMobile) vendor.vendorMobile = vendorMobile;
    if (businessCategory) vendor.businessCategory = businessCategory;
    if (website !== undefined) vendor.website = website;
    if (description !== undefined) vendor.description = description;

    // Update location details
    if (location) {
      const updatedLocation = vendor.location ? { ...vendor.location } : {};

      if (location.businessName) {
        updatedLocation.businessName = location.businessName;
      }
      if (location.streetAddress) {
        updatedLocation.streetAddress = location.streetAddress;
      }
      if (location.city) {
        updatedLocation.city = location.city;
      }
      if (location.district) {
        updatedLocation.district = location.district;
      }
      if (location.postalCode) {
        updatedLocation.postalCode = location.postalCode;
      }
      if (location.country) {
        updatedLocation.country = location.country;
      }
      if (location.coordinates) {
        updatedLocation.coordinates = {
          ...updatedLocation.coordinates,
          ...location.coordinates,
        };
      }

      // Handle latitude and longitude from venue details form
      if (location.latitude || location.longitude) {
        updatedLocation.coordinates = updatedLocation.coordinates || {};
        if (location.latitude) {
          updatedLocation.coordinates.lat = parseFloat(location.latitude);
        }
        if (location.longitude) {
          updatedLocation.coordinates.lng = parseFloat(location.longitude);
        }
      }

      vendor.location = updatedLocation;
    }

    await vendor.save();

    res.status(200).json({
      success: true,
      message: "Venue details updated successfully",
      data: {
        companyName: vendor.companyName,
        businessRegistrationNo: vendor.businessRegistrationNo,
        vendorMobile: vendor.vendorMobile,
        businessCategory: vendor.businessCategory,
        website: vendor.website,
        description: vendor.description,
        location: vendor.location,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update venue details",
      error: error.message,
    });
  }
};
