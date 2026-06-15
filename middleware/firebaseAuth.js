import admin from "firebase-admin";

// Initialize Firebase Admin SDK once (lazy singleton)
function getFirebaseApp() {
  if (admin.apps.length > 0) return admin.apps[0];

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export const firebaseAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message:
        "No Firebase token provided. Include: Authorization: Bearer <token>",
    });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    getFirebaseApp();
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("[Firebase Auth] Token verification failed:", error.message);

    let message = "Invalid or expired Firebase token";
    if (error.code === "auth/id-token-expired") {
      message = "Firebase token has expired. Please re-authenticate.";
    } else if (error.code === "auth/argument-error") {
      message = "Malformed Firebase token.";
    }

    return res.status(401).json({
      success: false,
      message,
    });
  }
};
