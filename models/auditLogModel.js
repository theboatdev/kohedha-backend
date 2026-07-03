import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    action: {
      type: String,
      required: true, // impersonation.start, impersonation.end,..
    },
    method: {
      type: String,
      required: true, // GET, POST, PUT, DELETE
    },
    path: {
      type: String,
      required: true, // req.originalUrl
    },
    statusCode: {
      type: Number,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

auditLogSchema.index({ vendorId: 1, createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
