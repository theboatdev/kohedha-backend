/**
 * One-off script to provision a platform admin account.
 *
 * Usage:
 *   node scripts/createAdmin.js <email> <password> [name]
 *
 * Requires MONGO_URI (and other backend .env vars) to be available,
 * so run it from the backend/ directory where .env lives.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Admin from "../models/adminModel.js";

dotenv.config();

const [, , email, password, name] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/createAdmin.js <email> <password> [name]");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters long.");
  process.exit(1);
}

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const existing = await Admin.findOne({ email });
    if (existing) {
      console.error(`Admin with email "${email}" already exists.`);
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = await Admin.create({
      email,
      password: hashedPassword,
      name: name || undefined,
    });

    console.log(`Admin created successfully: ${admin.email} (${admin._id})`);
    process.exit(0);
  } catch (error) {
    console.error("Failed to create admin:", error.message);
    process.exit(1);
  }
};

run();
