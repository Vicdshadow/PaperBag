/**
 * seller.js — Seller Dashboard
 *
 * Handles:
 *  - Auth + role verification (must be "seller" in /users/{uid})
 *  - Product upload: image → Firebase Storage, data → Firestore "products"
 *  - Real-time product list via onSnapshot (sellerId == auth.uid)
 *  - Edit (updateDoc) and Delete (deleteDoc) — only owner can act
 *
 * Imports from the shared firebase-config.js (do NOT create a new config).
 */

import {
  auth,
  db,
  storage,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  ref,
  uploadBytes,
  getDownloadURL,
} from "./firebase-config.js";

// ─── DOM Elements ────────────────────────────────────────────────────────────
const loadingOverlay = document.getElementById("loading");
const dashboardContent = document.getElementById("dashboard-content");
const logoutBtn = document.getElementById("logout-btn");
const productForm = document.getElementById("product-form");
const submitBtn = document.getElementById("submit-btn");
const uploadStatus = document.getElementById("upload-status");
const productsContainer = document.getElementById("products-container");
const productCountBadge = document.getElementById("product-count-badge");
const progressWrap = document.getElementById("progress-wrap");
const progressBar = document.getElementById("progress-bar");
const imagePreviewWrap = document.getElementById("image-preview-wrap");
const imagePreviewImg = document.getElementById("image-preview");
const productDescInput = document.getElementById("product-desc");
const productConditionInput = document.getElementById("product-condition");

// Edit Modal
const editModal = document.getElementById("edit-modal");
const closeModal = document.getElementById("close-modal");
const editForm = document.getElementById("edit-form");
const saveEditBtn = document.getElementById("save-edit-btn");
const editStatus = document.getElementById("edit-status");

let currentUser = null;
const roleCacheKey = (uid) => `ekoast_role_${uid}`;

function getCachedRole(uid) {
  try {
    return localStorage.getItem(roleCacheKey(uid));
  } catch {
    return null;
  }
}

function cacheRole(uid, role) {
  try {
    localStorage.setItem(roleCacheKey(uid), role);
  } catch {}
}

// ─── 1. Authentication Check + Role Verification ─────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not logged in → redirect to login
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    // Check /users/{uid} for role === "seller"
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists() && userDoc.data().role === "seller") {
      cacheRole(user.uid, "seller");
      // ✅ Access granted — show dashboard
      loadingOverlay.classList.add("hidden");
      dashboardContent.classList.remove("hidden");

      // Start real-time product feed
      setupRealtimeProducts(user.uid);
    } else {
      // ❌ Not a seller
      alert("Access Denied: Only verified sellers can access this dashboard.");
      await signOut(auth);
      window.location.href = "login.html";
    }
  } catch (error) {
    console.error("Error verifying seller status:", error);
    if (getCachedRole(user.uid) === "seller") {
      loadingOverlay.classList.add("hidden");
      dashboardContent.classList.remove("hidden");
      setupRealtimeProducts(user.uid);
      return;
    }
    const code = error?.code || "unknown-error";
    const reason =
      code === "permission-denied"
        ? "Permission denied reading your user profile in Firestore."
        : code === "unavailable" || code === "failed-precondition"
          ? "Firestore is temporarily unavailable or network is blocked."
          : error?.message || "Unknown verification error.";

    alert(`Seller verification failed [${code}]: ${reason}`);
  }
});

// ─── 2. Logout ───────────────────────────────────────────────────────────────
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error("Logout Error:", error);
  }
});

// ─── Auxiliary: File to Base64 ───
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

function inferConditionFromDescription(description) {
  const text = (description || "").toLowerCase();
  const preownedHints = [
    "preowned",
    "pre-owned",
    "used",
    "second hand",
    "fairly used",
    "tokunbo",
    "refurbished",
  ];
  return preownedHints.some((hint) => text.includes(hint))
    ? "preowned"
    : "brand_new";
}

const CATEGORY_MAP = {
  Electronics: "electronics",
  "Car Electronics": "car-electronics",
  "Home Appliances": "home-appliances",
  "Home & Living": "furniture",
  Furniture: "furniture",
  Books: "books",
  Fashion: "fashion",
  Perfume: "perfume",
  Beauty: "perfume",
  Office: "office",
  "IT Equipment": "it",
  Computers: "it",
  Phones: "electronics",
  Automobiles: "car-electronics",
  Bicycles: "bicycles",
  "Sporting Goods": "bicycles",
  Power: "power",
  Lighting: "lighting",
  "Spare Parts": "spare-parts",
};

function normalizeCategory(label) {
  if (!label) return "other";
  return (
    CATEGORY_MAP[label] ||
    label
      .toLowerCase()
      .trim()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

// ─── Image Preview Listener ───
document
  .getElementById("product-image")
  .addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        imagePreviewImg.src = base64;
        imagePreviewWrap.style.display = "block";
      } catch (err) {
        console.error("Error generating preview:", err);
      }
    } else {
      imagePreviewWrap.style.display = "none";
    }
  });

if (productDescInput && productConditionInput) {
  productDescInput.addEventListener("input", () => {
    productConditionInput.value = inferConditionFromDescription(
      productDescInput.value,
    );
  });
}

// ─── 3. Product Upload ───────────────────────────────────────────────────────
productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const name = document.getElementById("product-name").value.trim();
  const price = parseFloat(document.getElementById("product-price").value);
  const categoryLabel = document.getElementById("product-category").value;
  const category = normalizeCategory(categoryLabel);
  const desc = document.getElementById("product-desc").value.trim();
  const condition =
    productConditionInput?.value || inferConditionFromDescription(desc);
  const imageInput = document.getElementById("product-image");
  const imageFile = imageInput.files[0];

  // Validation
  if (!imageFile) {
    showStatus(uploadStatus, "❌ Please select a product image.", "red");
    return;
  }
  if (!name || isNaN(price) || price < 0) {
    showStatus(
      uploadStatus,
      "❌ Please fill in all required fields correctly.",
      "red",
    );
    return;
  }

  // ── UI: Loading state ──
  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Uploading Image...';
  uploadStatus.textContent = "";
  progressWrap.style.display = "block";
  setProgress(20);

  try {
    // 3a. Convert image to Base64 (Temporary solution instead of Firebase Storage)
    submitBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Processing Image...';
    const downloadURL = await fileToBase64(imageFile);
    setProgress(70);

    submitBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Saving to Database...';

    // 3b. Save product document to Firestore "products" collection
    const newProduct = {
      name: name,
      price: price,
      description: desc,
      category: category,
      categoryLabel: categoryLabel,
      condition: condition,
      imageURL: downloadURL, // used by shop.js / buyer views
      image: downloadURL, // alias used by index.js renderProducts
      sellerId: currentUser.uid,
      sellerEmail: currentUser.email,
      createdAt: serverTimestamp(),
      status: "active",
    };

    await addDoc(collection(db, "products"), newProduct);
    setProgress(100);

    // 3c. Reset form
    productForm.reset();
    imagePreviewWrap.style.display = "none";
    showStatus(uploadStatus, "✅ Product uploaded successfully!", "green");

    setTimeout(() => {
      uploadStatus.textContent = "";
      progressWrap.style.display = "none";
      setProgress(0);
    }, 4000);
  } catch (error) {
    console.error("Error uploading product:", error);
    showStatus(uploadStatus, `❌ Upload failed: ${error.message}`, "red");
    progressWrap.style.display = "none";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML =
      '<i class="fas fa-cloud-upload-alt"></i> Upload Product';
  }
});

// ─── 4. Real-Time Product Feed (onSnapshot) ───────────────────────────────────
function setupRealtimeProducts(userId) {
  // Query only THIS seller's products, ordered by newest first
  const q = query(collection(db, "products"), where("sellerId", "==", userId));

  onSnapshot(
    q,
    (snapshot) => {
      productsContainer.innerHTML = "";

      if (snapshot.empty) {
        productCountBadge.classList.add("hidden");
        productsContainer.innerHTML = `
          <div style="grid-column:1/-1; text-align:center; padding:3rem; background:#fff; border-radius:0.75rem; border: 1px dashed #e6e6ea;">
            <i class="fas fa-box-open" style="font-size:3rem; color:#d4d4da; display:block; margin-bottom:1rem;"></i>
            <p style="color:#55555e; margin:0; font-size:1rem;">You haven't uploaded any products yet.</p>
            <p style="color:#72727b; margin:0.5rem 0 0; font-size:0.85rem;">Use the form on the left to add your first product.</p>
          </div>
        `;
        return;
      }

      // Update count badge
      const count = snapshot.size;
      productCountBadge.textContent = count;
      productCountBadge.classList.remove("hidden");

      snapshot.forEach((docSnap) => {
        const product = docSnap.data();
        const id = docSnap.id;

        const priceFormatted = product.price
          ? Number(product.price).toLocaleString("en-NG")
          : "0";
        const shortDesc = product.description
          ? product.description.substring(0, 80) +
            (product.description.length > 80 ? "..." : "")
          : "";

        const conditionLabel =
          (product.condition || inferConditionFromDescription(product.description)) ===
          "preowned"
            ? "Preowned"
            : "Brand New";

        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
          <img
            src="${product.imageURL || product.imageUrl || product.image || ""}"
            alt="${escapeHtml(product.name)}"
            class="product-image"
            onerror="this.src='assets/images/placeholder.svg'"
          >
          <div class="product-details">
            <h3 class="product-title">${escapeHtml(product.name)}</h3>
            <p class="product-price">₦${priceFormatted}</p>
            ${product.categoryLabel || product.category ? `<span class="product-category">${escapeHtml(product.categoryLabel || product.category)}</span>` : ""}
            <span class="product-category">${conditionLabel}</span>
            <p class="product-desc">${escapeHtml(shortDesc)}</p>
            <div class="product-actions">
              <button
                class="btn-action btn-edit"
                data-id="${id}"
                data-name="${escapeHtml(product.name)}"
                data-price="${product.price}"
                data-desc="${escapeHtml(product.description || "")}"
              >
                <i class="fas fa-edit"></i> Edit
              </button>
              <button class="btn-action btn-delete" data-id="${id}">
                <i class="fas fa-trash"></i> Delete
              </button>
            </div>
          </div>
        `;
        productsContainer.appendChild(card);
      });

      // Re-attach event listeners to dynamically created buttons
      attachActionListeners();
    },
    (error) => {
      console.error("Snapshot listener error:", error);
      productsContainer.innerHTML = `
        <p style="color:red; grid-column:1/-1; text-align:center;">
          Error loading products. Please refresh the page.
        </p>
      `;
    },
  );
}

// ─── 5. Product Management: Edit & Delete ────────────────────────────────────
function attachActionListeners() {
  // Delete buttons
  productsContainer.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.closest("button").dataset.id;
      if (!id) return;

      if (
        confirm(
          "Are you sure you want to permanently delete this product? This cannot be undone.",
        )
      ) {
        try {
          // Security rule: only the owner (sellerId == auth.uid) can delete
          await deleteDoc(doc(db, "products", id));
        } catch (error) {
          console.error("Delete error:", error);
          alert("Failed to delete: " + error.message);
        }
      }
    });
  });

  // Edit buttons → open modal pre-filled
  productsContainer.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.target.closest("button");
      document.getElementById("edit-id").value = target.dataset.id;
      document.getElementById("edit-name").value = target.dataset.name;
      document.getElementById("edit-price").value = target.dataset.price;
      document.getElementById("edit-desc").value = target.dataset.desc;
      editStatus.textContent = "";
      editModal.classList.remove("hidden");
    });
  });
}

// Close modal
closeModal.addEventListener("click", () => editModal.classList.add("hidden"));
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) editModal.classList.add("hidden");
});

// Edit form submission
editForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("edit-id").value;
  const newName = document.getElementById("edit-name").value.trim();
  const newPrice = parseFloat(document.getElementById("edit-price").value);
  const newDesc = document.getElementById("edit-desc").value.trim();

  if (!id || !newName || isNaN(newPrice)) {
    showStatus(editStatus, "❌ Please fill in all fields.", "red");
    return;
  }

  try {
    saveEditBtn.disabled = true;
    saveEditBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    // Security rule: only owner can update (sellerId == auth.uid enforced server-side)
    await updateDoc(doc(db, "products", id), {
      name: newName,
      price: newPrice,
      description: newDesc,
    });

    showStatus(editStatus, "✅ Product updated!", "green");
    setTimeout(() => editModal.classList.add("hidden"), 1200);
  } catch (error) {
    console.error("Update error:", error);
    showStatus(editStatus, `❌ Failed to save: ${error.message}`, "red");
  } finally {
    saveEditBtn.disabled = false;
    saveEditBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function showStatus(el, message, color) {
  el.textContent = message;
  el.style.color = color;
}

function setProgress(percent) {
  if (progressBar) progressBar.style.width = percent + "%";
}

/** Prevent XSS in innerHTML templates */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

