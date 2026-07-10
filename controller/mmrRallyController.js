import MmrRallySubmission from "../models/mmrRallySubmissionModel.js";
import {
  RALLY_LOCATIONS,
  ACTIVE_LOCATION_IDS,
} from "../config/mmrRallyLocations.js";

function validateSriLankanMobile(value) {
  const normalised = value.replace(/\s/g, "");
  return /^(\+94|0)\d{9}$/.test(normalised);
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const createRallySubmission = async (req, res) => {
  try {
    // With multer the body is already parsed; answers is sent as a JSON string.
    const rawLocation = req.body.location;
    let rawAnswers;
    try {
      rawAnswers =
        typeof req.body.answers === "string"
          ? JSON.parse(req.body.answers)
          : req.body.answers;
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid answers payload.",
      });
    }

    const location = parseInt(rawLocation, 10);
    if (!Number.isFinite(location) || !ACTIVE_LOCATION_IDS.includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive checkpoint location.",
      });
    }

    if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
      return res.status(400).json({
        success: false,
        message: "Answers must be an object.",
      });
    }

    const locationConfig = RALLY_LOCATIONS[location];
    const allowedKeys = new Set(locationConfig.fields.map((f) => f.name));

    // Reject unknown keys
    for (const key of Object.keys(rawAnswers)) {
      if (!allowedKeys.has(key)) {
        return res.status(400).json({
          success: false,
          message: `Unknown field: "${key}"`,
        });
      }
    }

    const answers = {};

    for (const field of locationConfig.fields) {
      const raw = rawAnswers[field.name];
      const value = typeof raw === "string" ? raw.trim() : "";

      if (field.required && !value) {
        return res.status(400).json({
          success: false,
          message: `"${field.name}" is required.`,
        });
      }

      if (value) {
        if (field.type === "tel" && !validateSriLankanMobile(value)) {
          return res.status(400).json({
            success: false,
            message:
              "Please enter a valid Sri Lankan number (e.g. +94712345678 or 0712345678)",
          });
        }
        if (field.type === "email" && !validateEmail(value)) {
          return res.status(400).json({
            success: false,
            message: `"${field.name}" must be a valid email address.`,
          });
        }
        if (field.type === "number" && isNaN(Number(value))) {
          return res.status(400).json({
            success: false,
            message: `"${field.name}" must be a number.`,
          });
        }
        answers[field.name] = value;
      }
    }

    // Collect Cloudinary URLs from uploaded files (optional).
    const imageUrls = Array.isArray(req.files)
      ? req.files.map((f) => f.path)
      : [];

    const submission = await MmrRallySubmission.create({
      location,
      answers,
      imageUrls,
    });

    return res.status(201).json({
      success: true,
      message: "Check-in submitted successfully!",
      data: { id: submission._id },
    });
  } catch (error) {
    console.error("MMR Rally submission error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};
