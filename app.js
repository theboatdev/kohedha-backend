import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import passport from "passport";
import { setupPassport } from "./config/passport.js";

dotenv.config();

// Routes
import vendorRoutes from "./routes/vendorRoutes.js";
import googleAuthRoutes from "./routes/googleAuthRoutes.js";
import tableRoutes from "./routes/tableRoutes.js";
import menuRoutes from "./routes/menuRoutes.js";
import sectionRoutes from "./routes/sectionRoutes.js";
import bookingSlotRoutes from "./routes/bookingSlotRoutes.js";
import customerBookingRoutes from "./routes/customerBookingRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import dealRoutes from "./routes/dealRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import mobileRoutes from "./routes/mobileRoutes.js";
import waitlistRoutes from "./routes/waitlistRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();
const port = process.env.PORT || 5002;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

connectDB();
setupPassport();

// Middleware to parse json bodies
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:3000","http://localhost:3001" ],
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// Serve uploaded files (menu images, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/vendor", vendorRoutes);
app.use("/api/vendor/tables", tableRoutes);
app.use("/api/vendor/auth", googleAuthRoutes);
app.use("/api/vendor/menu", menuRoutes);
app.use("/api/vendor/sections", sectionRoutes);
app.use("/api/vendor/booking-slot", bookingSlotRoutes);
app.use("/api/public/booking", customerBookingRoutes);
app.use("/api/vendor/events", eventRoutes);
app.use("/api/vendor/deals", dealRoutes);
app.use("/api/vendor/dashboard", dashboardRoutes);
app.use("/api/mobile", mobileRoutes);
app.use("/api/public/wait-list", waitlistRoutes);
app.use("/api/admin", adminRoutes);

app.listen(port, () => console.log(`Server running on port ${port}`));
