import Event from "../models/eventModel.js";
import cloudinary from "../config/cloudinary.js";

// Helper: extract cloudinary public_id from URL
function extractPublicId(url) {
  try {
    // URL format: https://res.cloudinary.com/{cloud}/image/upload/v{ver}/{public_id}.{ext}
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-z]+$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Helper: delete an array of image objects from cloudinary
async function deleteCloudinaryImages(images) {
  for (const img of images) {
    if (!img.url) continue;
    try {
      const publicId = extractPublicId(img.url);
      if (publicId) await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error("Failed to delete cloudinary image:", err);
    }
  }
}

// Create a new event
export const createEvent = async (req, res) => {
  try {
    const {
      eventName,
      description,
      category,
      eventDate,
      eventEndDate,
      eventTime,
      maxCapacity,
      location,
      ticketPrice,
      images,
      isFree,
      isPublished,
      tags,
      contactPerson,
    } = req.body;

    // Validation
    if (
      !eventName ||
      !description ||
      !eventDate ||
      !eventTime ||
      !maxCapacity ||
      !location
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields",
      });
    }

    // Build images array: cloudinary-uploaded file + any pre-existing URL objects from body
    const uploadedImages = req.file ? [{ url: req.file.path }] : [];
    let bodyImages = [];
    if (images) {
      try {
        bodyImages = typeof images === "string" ? JSON.parse(images) : images;
      } catch {}
    }
    const allImages = [...bodyImages, ...uploadedImages];

    // Parse contactPerson if sent as JSON string (multipart form)
    let parsedContactPerson = contactPerson || {};
    if (typeof contactPerson === "string") {
      try {
        parsedContactPerson = JSON.parse(contactPerson);
      } catch {}
    }

    // Parse tags if sent as JSON string
    let parsedTags = tags || [];
    if (typeof tags === "string" && tags.startsWith("[")) {
      try {
        parsedTags = JSON.parse(tags);
      } catch {}
    }

    // Create event
    const event = await Event.create({
      vendorId: req.vendor.id,
      eventName,
      description,
      category: category || "other",
      eventDate,
      eventEndDate,
      eventTime,
      maxCapacity,
      location,
      ticketPrice: ticketPrice || 0,
      images: allImages,
      isFree: ticketPrice > 0 ? false : true,
      isPublished: isPublished !== undefined ? isPublished : true,
      tags: parsedTags,
      contactPerson: parsedContactPerson,
      status: "upcoming",
    });

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: event,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error creating event",
    });
  }
};

// Get all events for a vendor
export const getVendorEvents = async (req, res) => {
  try {
    const { status, isPublished, sortBy } = req.query;

    // Build filter
    let filter = { vendorId: req.vendor.id };

    if (status) {
      filter.status = status;
    }

    if (isPublished !== undefined) {
      filter.isPublished = isPublished === "true";
    }

    // Sort options
    let sort = { eventDate: -1 }; // Default: newest first

    if (sortBy === "oldest") {
      sort = { eventDate: 1 };
    }

    const events = await Event.find(filter).sort(sort);

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching events",
    });
  }
};

// Get single event by ID
export const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if vendor owns this event
    if (event.vendorId.toString() !== req.vendor.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this event",
      });
    }

    res.status(200).json({
      success: true,
      data: event,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching event",
    });
  }
};

// Update event
export const updateEvent = async (req, res) => {
  try {
    let event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check ownership
    if (event.vendorId.toString() !== req.vendor.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this event",
      });
    }

    // Check if event is completed or cancelled
    if (event.status === "completed" || event.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: `Cannot update a ${event.status} event`,
      });
    }

    // Update fields
    const {
      eventName,
      description,
      category,
      eventDate,
      eventEndDate,
      eventTime,
      maxCapacity,
      location,
      ticketPrice,
      images,
      isFree,
      isPublished,
      status,
      tags,
      contactPerson,
    } = req.body;

    if (eventName) event.eventName = eventName;
    if (description) event.description = description;
    if (category) event.category = category;
    if (eventDate) event.eventDate = eventDate;
    if (eventEndDate) event.eventEndDate = eventEndDate;
    if (eventTime) event.eventTime = eventTime;
    if (maxCapacity) event.maxCapacity = maxCapacity;
    if (location) event.location = location;
    if (ticketPrice !== undefined) {
      event.ticketPrice = ticketPrice;
      event.isFree = ticketPrice > 0 ? false : true;
    }

    // Handle image updates
    // existingImages: JSON array of image objects the client wants to keep
    let existingImagesToKeep = event.images; // default: keep all current
    if (req.body.existingImages !== undefined) {
      try {
        existingImagesToKeep =
          typeof req.body.existingImages === "string"
            ? JSON.parse(req.body.existingImages)
            : req.body.existingImages;
      } catch {}
    }

    // Delete removed images from cloudinary
    const keepUrls = new Set(existingImagesToKeep.map((img) => img.url));
    const imagesToRemove = event.images.filter((img) => !keepUrls.has(img.url));
    await deleteCloudinaryImages(imagesToRemove);

    // Upload new image (single)
    const newUploadedImages = req.file ? [{ url: req.file.path }] : [];
    event.images = [...existingImagesToKeep, ...newUploadedImages];

    if (isFree !== undefined) event.isFree = isFree;
    if (isPublished !== undefined) event.isPublished = isPublished;
    if (status) event.status = status;
    if (tags) {
      let parsedTags = tags;
      if (typeof tags === "string" && tags.startsWith("[")) {
        try {
          parsedTags = JSON.parse(tags);
        } catch {}
      }
      event.tags = parsedTags;
    }
    if (contactPerson) {
      let parsedContactPerson = contactPerson;
      if (typeof contactPerson === "string") {
        try {
          parsedContactPerson = JSON.parse(contactPerson);
        } catch {}
      }
      event.contactPerson = parsedContactPerson;
    }

    const updatedEvent = await event.save();

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: updatedEvent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error updating event",
    });
  }
};

// Delete event
export const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check ownership
    if (event.vendorId.toString() !== req.vendor.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this event",
      });
    }

    // Delete event images from cloudinary
    await deleteCloudinaryImages(event.images || []);

    await Event.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting event",
    });
  }
};
