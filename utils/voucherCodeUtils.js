import crypto from "crypto";
import DealClaim from "../models/dealClaimModel.js";
import DealLoyaltyCard from "../models/dealLoyaltyCardModel.js";

// Alphabet excludes visually ambiguous characters (0/O, 1/I/L) so staff can
// key codes in by hand without transcription errors.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8; // rendered as XXXX-XXXX

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// Generates a code guaranteed unique against the given model's `code` field.
// Collisions are astronomically unlikely (32^8 keyspace) but we guard anyway.
async function generateUniqueCode(Model, { maxAttempts = 5 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = randomCode();
    const existing = await Model.findOne({ code }).select("_id").lean();
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique code, please retry");
}

// Unique among DealClaim documents (vouchers + limited-quantity + loyalty
// reward tokens all live there).
export async function generateUniqueVoucherCode(options) {
  return generateUniqueCode(DealClaim, options);
}

// Unique among DealLoyaltyCard documents (persistent per-customer stamp cards).
export async function generateUniqueLoyaltyCardCode(options) {
  return generateUniqueCode(DealLoyaltyCard, options);
}
