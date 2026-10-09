/**
 * Admin Backend Server
 * Secure Node.js + Express backend using Firebase Admin SDK
 *
 * IMPORTANT:
 * - Never expose this server or serviceAccountKey.json to the public/frontend
 * - Run this locally or deploy to a secure server (e.g., Cloud Run, Render, Railway)
 */

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const admin = require("firebase-admin");
const path = require("path");

// --- Initialize Firebase Admin SDK ---
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ekoast-default-rtdb.firebaseio.com",
  storageBucket: `${serviceAccount.project_id}.appspot.com`,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// --- Express Setup ---
const app = express();
const PORT = process.env.PORT || 3001;

// CORS: Allow only your frontend's origin in production
app.use(
  cors({
    origin: [
      "http://localhost:5500", // VS Code Live Server
      "http://127.0.0.1:5500", // VS Code Live Server (alt)
      "http://localhost:3001",
      // Add your deployed frontend URL here, e.g.:
      // "https://your-ekoast-site.web.app",
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// --- Multer: In-memory file storage ---
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (jpg, png, webp, gif) are allowed."));
    }
  },
});

// --- Middleware: Verify Firebase ID Token ---
async function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. No token provided." });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;

    // --- Authorization: Check Firestore for admin role ---
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: "User record not found." });
    }

    const userData = userDoc.data();
    if (userData.role !== "admin" && userData.role !== "seller") {
      return res
        .status(403)
        .json({ error: "Forbidden. Admin or seller role required." });
    }

    req.userRole = userData.role;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(403).json({ error: "Invalid or expired token." });
  }
}

// --- POST /upload-product ---
app.post(
  "/upload-product",
  verifyAdminToken,
  upload.single("image"),
  async (req, res) => {
    try {
      // Validate required fields
      const { name, price, category, subCategory, description, condition } =
        req.body;
      if (!name || !price || !category || !description) {
        return res.status(400).json({
          error: "Missing required fields: name, price, category, description.",
        });
      }

      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return res
          .status(400)
          .json({ error: "Price must be a valid positive number." });
      }

      let imageUrl = req.body.imageUrl;

      // If a file is uploaded, use it. Otherwise, use the provided imageUrl (if any)
      if (req.file) {
        const filename = `products/${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
        const file = bucket.file(filename);

        await file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
          public: true, // make publicly readable
        });

        imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
      } else if (!imageUrl) {
        return res.status(400).json({ error: "Product image is required." });
      }

      // --- Save product to Firestore ---
      const productData = {
        name,
        price: parsedPrice,
        category,
        subCategory: subCategory || "",
        description,
        condition: condition || "brand_new",
        imageUrl,
        uploadedBy: req.user.uid,
        uploaderEmail: req.user.email || "unknown",
        uploaderRole: req.userRole,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        soldOut: false,
        rating: 0,
        reviews: [],
      };

      const docRef = await db.collection("products").add(productData);

      return res.status(201).json({
        success: true,
        message: "Product uploaded successfully!",
        productId: docRef.id,
        imageUrl,
      });
    } catch (err) {
      console.error("Error uploading product:", err);
      return res
        .status(500)
        .json({ error: "Internal server error. " + err.message });
    }
  },
);

// --- POST /update-order-status ---
app.post("/update-order-status", verifyAdminToken, async (req, res) => {
  const { orderId, status } = req.body;

  if (!orderId || !status) {
    return res.status(400).json({ error: "Missing orderId or status." });
  }

  if (req.userRole !== "admin") {
    return res
      .status(403)
      .json({ error: "Forbidden. Admin role required." });
  }

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found." });
    }

    const prev = orderSnap.data();
    await orderRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid,
      updatedByRole: req.userRole,
    });

    await db.collection("escrow_audit").add({
      orderId,
      action: "update-order-status",
      fromStatus: prev.status || null,
      toStatus: status,
      amount: prev.amount || null,
      buyerId: prev.buyerId || null,
      sellerId: prev.sellerId || null,
      adminId: req.user.uid,
      adminEmail: req.user.email || null,
      role: req.userRole,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      message: `Order status updated to ${status}`,
    });
  } catch (err) {
    console.error("Error updating order status:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- POST /delete-product ---
app.post("/delete-product", verifyAdminToken, async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ error: "Missing productId." });
  }

  try {
    await db.collection("products").doc(productId).delete();
    return res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- POST /manage-user ---
app.post("/manage-user", verifyAdminToken, async (req, res) => {
  const { userId, action } = req.body; // action: 'suspend', 'reactivate', 'delete'

  if (!userId || !action) {
    return res.status(400).json({ error: "Missing userId or action." });
  }

  try {
    const userRef = db.collection("users").doc(userId);

    if (action === "suspend") {
      await userRef.update({ status: "suspended" });
      return res.json({ success: true, message: "User suspended." });
    } else if (action === "reactivate") {
      await userRef.update({ status: "active" });
      return res.json({ success: true, message: "User access restored." });
    } else if (action === "delete") {
      await userRef.delete();
      // Optional: Also delete from Firebase Auth (requires more privileges or separate flow)
      // await admin.auth().deleteUser(userId);
      return res.json({ success: true, message: "User account deleted." });
    } else {
      return res.status(400).json({ error: "Invalid action." });
    }
  } catch (err) {
    console.error("Error managing user:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- Health Check ---
app.get("/", (req, res) => {
  res.json({ status: "Admin Backend is running ✅" });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: err.message || "Internal server error." });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`\n🚀 Admin Backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}`);
  console.log(
    `   Upload endpoint: POST http://localhost:${PORT}/upload-product\n`,
  );
});

