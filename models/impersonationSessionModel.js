import mongoose from "mongoose";

// Tracks impersonation sessions server-side so a JWT can be revoked before
// its natural expiry (JWTs are otherwise stateless and can't be invalidated).
// Every impersonation token carries a `jti` that must match an active
// session here, checked on every request in `authenticate`/`protect`.
const impersonationSessionSchema = new mongoose.Schema(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
    },
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
    active: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Note: no explicit index on `jti` here - `unique: true` above already
// creates one; adding another would just duplicate it.
impersonationSessionSchema.index({ vendorId: 1, active: 1 });
// Auto-purge session records shortly after token expiry - keeps the
// collection small without needing a separate cleanup job.
impersonationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const ImpersonationSession = mongoose.model(
  "ImpersonationSession",
  impersonationSessionSchema,
);
export default ImpersonationSession;
