import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import Vendor from "../models/vendorModel.js";

export const setupPassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let vendor = await Vendor.findOne({ googleId: profile.id });

          if (vendor) {
            return done(null, vendor);
          }

          vendor = await Vendor.findOne({ email: profile.emails[0].value });

          if (vendor) {
            vendor.googleId = profile.id;
            vendor.authProvider = "google";
            vendor.profilePicture = profile.photos[0]?.value;
            await vendor.save();
            return done(null, vendor);
          }

          vendor = await Vendor.create({
            googleId: profile.id,
            email: profile.emails[0].value,
            authProvider: "google",
            profilePicture: profile.photos[0]?.value,
            registrationStep: 1,
          });
          done(null, vendor);
        } catch (error) {
          done(error, null);
        }
      },
    ),
  );

  passport.serializeUser((vendor, done) => {
    done(null, vendor.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const vendor = await Vendor.findById(id);
      done(null, vendor);
    } catch (error) {
      done(error, null);
    }
  });
};
