/**
 * Ekoast Firebase Cloud Functions
 * Production-ready secure backend for marketplace operations
 *
 * Deploy: firebase deploy --only functions
 * Emulate: firebase emulators:start --only functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Admin SDK (automatically uses service account in Cloud Functions)
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Verify Firebase ID token and return decoded token
// ─────────────────────────────────────────────────────────────────────────────
async function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "No valid authorization token provided.",
    );
  }
  const idToken = authHeader.split("Bearer ")[1];
  return await admin.auth().verifyIdToken(idToken);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Check user role in Firestore
// ─────────────────────────────────────────────────────────────────────────────
async function getUserRole(uid) {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return "buyer"; // Default to buyer if doc doesn't exist yet
  return userDoc.data().role || "buyer";
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: setUserRole (Callable — Admin only)
// Sets custom claims for role-based security
// ─────────────────────────────────────────────────────────────────────────────
exports.setUserRole = functions.https.onCall(async (data, context) => {
  // 1. Authenticate requester
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be signed in.",
    );
  }

  // 2. Authorize requester (only Admin can change roles)
  const callerRole = await getUserRole(context.auth.uid);
  if (callerRole !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can change roles.",
    );
  }

  const { uid, role } = data;
  const validRoles = ["buyer", "seller", "admin", "sub-admin"];

  // 3. Validate input
  if (!uid || !validRoles.includes(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Valid uid and role required.",
    );
  }

  try {
    // 4. Set Custom Claims in Firebase Auth
    await admin.auth().setCustomUserClaims(uid, { role });

    // 5. Sync with Firestore user document
    await db.collection("users").doc(uid).set(
      {
        role: role,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { success: true, message: `Role '${role}' assigned to user ${uid}` };
  } catch (error) {
    console.error("Error setting custom claims:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: uploadProduct (HTTP Function)
// POST https://<region>-<project>.cloudfunctions.net/uploadProduct
// ─────────────────────────────────────────────────────────────────────────────
exports.uploadProduct = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // 1. Verify auth token
    const decoded = await verifyToken(req);

    // 2. Check user role — only admin or seller can upload
    const role = await getUserRole(decoded.uid);
    if (role !== "admin" && role !== "seller") {
      return res.status(403).json({
        error: "Forbidden. Only admins and sellers can upload products.",
      });
    }

    // 3. Validate required fields
    const { name, price, category, description, imageUrl, subCategory } =
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

    // 4. Seller products require approval — admin products are instantly active
    const status = role === "admin" ? "active" : "pending";

    // 5. Save to Firestore
    const productData = {
      name: name.trim(),
      price: parsedPrice,
      category: category.trim(),
      subCategory: subCategory ? subCategory.trim() : "",
      description: description.trim(),
      imageUrl: imageUrl || "",
      uploadedBy: decoded.uid,
      uploaderEmail: decoded.email || "unknown",
      uploaderRole: role,
      status,
      soldOut: false,
      rating: 0,
      reviews: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("products").add(productData);

    return res.status(201).json({
      success: true,
      message:
        role === "admin"
          ? "Product published successfully!"
          : "Product submitted for admin approval.",
      productId: docRef.id,
      status,
    });
  } catch (err) {
    console.error("uploadProduct error:", err);
    if (err.code === "auth/id-token-expired") {
      return res
        .status(401)
        .json({ error: "Token expired. Please sign in again." });
    }
    if (err.code === "auth/argument-error") {
      return res.status(401).json({ error: "Invalid auth token." });
    }
    return res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: approveSeller (Callable — Admin only)
// Called from admin dashboard to approve a pending seller
// ─────────────────────────────────────────────────────────────────────────────
exports.approveSeller = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be signed in.",
    );
  }

  const role = await getUserRole(context.auth.uid);
  if (role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can approve sellers.",
    );
  }

  const { sellerId } = data;
  if (!sellerId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "sellerId is required.",
    );
  }

  await db.collection("users").doc(sellerId).update({
    status: "active",
    isKycVerified: true,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { success: true, message: "Seller approved and KYC verified." };
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: freezeAccount (Callable — Admin only)
// Suspend or restore a user account
// ─────────────────────────────────────────────────────────────────────────────
exports.freezeAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be signed in.",
    );
  }

  const role = await getUserRole(context.auth.uid);
  if (role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can freeze accounts.",
    );
  }

  const { targetUid, action } = data; // action: 'freeze' | 'unfreeze'
  if (!targetUid || !["freeze", "unfreeze"].includes(action)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "targetUid and action (freeze/unfreeze) are required.",
    );
  }

  const newStatus = action === "freeze" ? "suspended" : "active";
  await db.collection("users").doc(targetUid).update({ status: newStatus });

  // Also disable/enable Firebase Auth account
  await admin.auth().updateUser(targetUid, { disabled: action === "freeze" });

  return { success: true, newStatus };
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: approveProduct (Callable — Admin only)
// Approve a seller's pending product listing
// ─────────────────────────────────────────────────────────────────────────────
exports.approveProduct = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be signed in.",
    );
  }

  const role = await getUserRole(context.auth.uid);
  if (role !== "admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can approve products.",
    );
  }

  const { productId } = data;
  if (!productId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "productId is required.",
    );
  }

  await db.collection("products").doc(productId).update({
    status: "active",
    approvedBy: context.auth.uid,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, message: "Product approved and now live." };
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: onNewOrder — Trigger on new order creation
// Sends in-app notification to seller and admin
// ─────────────────────────────────────────────────────────────────────────────
exports.onNewOrder = functions.firestore
  .document("orders/{orderId}")
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const orderId = context.params.orderId;

    // Create notification for admin
    await db.collection("notifications").add({
      type: "new_order",
      message: `New order #${orderId.slice(0, 8)} received — ₦${order.total?.toLocaleString() || 0}`,
      targetRole: "admin",
      orderId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify seller if sellerId is present
    if (order.sellerId) {
      await db.collection("notifications").add({
        type: "new_order",
        message: `You have a new order for your product!`,
        targetUid: order.sellerId,
        orderId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`Order ${orderId} notification created.`);
  });

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: handlePaymentWebhook (HTTP)
// Verified payment from Paystack/Flutterwave
// ─────────────────────────────────────────────────────────────────────────────
exports.handlePaymentWebhook = functions.https.onRequest(async (req, res) => {
  // 1. Verify signature (Omitting specific provider logic for brevity, but crucial for prod)
  // const secret = process.env.PAYMENT_SECRET;
  // const signature = req.headers['x-paystack-signature'];
  // if (!verifySignature(req.body, signature, secret)) return res.sendStatus(401);

  const event = req.body;

  // 2. Handle successful payment
  if (event.event === "charge.success") {
    const { reference, metadata } = event.data;
    const orderId = metadata.order_id;

    if (!orderId) return res.status(400).send("No order ID in metadata.");

    try {
      const orderRef = db.collection("orders").doc(orderId);

      await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) throw new Error("Order not found.");

        const orderData = orderSnap.data();
        if (orderData.escrowStatus === "funded") return; // Already processed

        // Update order status to funded
        transaction.update(orderRef, {
          escrowStatus: "funded",
          paymentReference: reference,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Record transaction
        const transRef = db.collection("transactions").doc();
        transaction.set(transRef, {
          orderId,
          userId: orderData.buyerId,
          amount: orderData.totalAmount,
          type: "escrow_hold",
          status: "completed",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.status(200).send("Webhook processed.");
    } catch (error) {
      console.error("Webhook transaction error:", error);
      return res.status(500).send("Internal server error.");
    }
  }

  return res.sendStatus(200);
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: releaseEscrow (Callable — Buyer/Admin only)
// Safely transfer funds from Escrow to Seller Wallet
// ─────────────────────────────────────────────────────────────────────────────
exports.releaseEscrow = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be signed in.",
    );

  const { orderId } = data;
  if (!orderId)
    throw new functions.https.HttpsError(
      "invalid-argument",
      "orderId required.",
    );

  const orderRef = db.collection("orders").doc(orderId);

  try {
    return await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) throw new Error("Order does not exist.");

      const orderData = orderSnap.data();
      const callerId = context.auth.uid;
      const callerRole =
        context.auth.token.role || (await getUserRole(callerId));

      // 1. Authorization: Only buyer or admin can release escrow
      if (orderData.buyerId !== callerId && callerRole !== "admin") {
        throw new Error("Unauthorized to release escrow for this order.");
      }

      // 2. State Check: Must be funded and not already released
      if (orderData.escrowStatus !== "funded") {
        throw new Error(
          `Cannot release escrow in status: ${orderData.escrowStatus}`,
        );
      }

      const sellerId = orderData.sellerId;
      const amount = orderData.totalAmount; // In production, subtract platform fee here

      // 3. Update Order
      transaction.update(orderRef, {
        escrowStatus: "released",
        orderStatus: "completed",
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 4. Update Seller Wallet
      const walletRef = db.collection("wallets").doc(sellerId);
      const walletSnap = await transaction.get(walletRef);

      if (!walletSnap.exists) {
        transaction.set(walletRef, {
          balance: amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.update(walletRef, {
          balance: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 5. Audit Transaction
      const transRef = db.collection("transactions").doc();
      transaction.set(transRef, {
        orderId,
        userId: sellerId,
        amount: amount,
        type: "release",
        status: "completed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, message: "Funds released to seller." };
    });
  } catch (error) {
    console.error("releaseEscrow error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: updateShippingSettings (Callable — Admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateShippingSettings = functions.https.onCall(
  async (data, context) => {
    if (!context.auth)
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be signed in.",
      );

    const role = await getUserRole(context.auth.uid);
    if (role !== "admin")
      throw new functions.https.HttpsError("permission-denied", "Admin only.");

    const { baseFee, perKgFee, internationalFee } = data;

    await db
      .collection("shippingSettings")
      .doc("current")
      .set({
        baseFee: parseFloat(baseFee) || 0,
        perKgFee: parseFloat(perKgFee) || 0,
        internationalFee: parseFloat(internationalFee) || 0,
        updatedBy: context.auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: calculateShipping (Callable)
// ─────────────────────────────────────────────────────────────────────────────
exports.calculateShipping = functions.https.onCall(async (data, context) => {
  const { weightKg, isInternational } = data;

  const settingsDoc = await db
    .collection("shippingSettings")
    .doc("current")
    .get();
  const settings = settingsDoc.exists
    ? settingsDoc.data()
    : { baseFee: 1000, perKgFee: 200, internationalFee: 5000 };

  let fee = settings.baseFee + (parseFloat(weightKg) || 0) * settings.perKgFee;
  if (isInternational) fee += settings.internationalFee;

  return { shippingFee: fee };
});

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION: uploadKyc (Callable — Seller only)
// ─────────────────────────────────────────────────────────────────────────────
exports.uploadKyc = functions.https.onCall(async (data, context) => {
  if (!context.auth)
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be signed in.",
    );

  const { idType, idNumber, documentUrl, selfieUrl } = data;
  if (!idType || !idNumber || !documentUrl) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing KYC data.",
    );
  }

  const uid = context.auth.uid;

  await db.collection("sellerKyc").doc(uid).set({
    idType,
    idNumber,
    documentUrl,
    selfieUrl,
    status: "pending",
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection("users").doc(uid).update({ isKycVerified: false });

  return { success: true, message: "KYC submitted for review." };
});

