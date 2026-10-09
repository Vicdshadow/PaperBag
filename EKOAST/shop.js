/**
 * shop.js — Buyer Shop / Product Display
 *
 * Listens to Firestore "products" collection in real-time using onSnapshot.
 * Renders all products where status == "active".
 *
 * Usage: Include in any HTML page that has:
 *   <div id="shop-products-container"></div>
 *
 * <script type="module" src="./shop.js"></script>
 */

import { db, collection, query, where, onSnapshot } from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("shop-products-container");

  if (!container) {
    // Not on a shop page — silently exit
    return;
  }

  // ── Show initial loading state ──
  container.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:3rem; color:#6b7280;">
      <i class="fas fa-spinner fa-spin" style="font-size:2.5rem; color:#ff6600; display:block; margin-bottom:1rem;"></i>
      <p style="font-size:1rem; margin:0;">Loading latest products...</p>
    </div>
  `;

  // ── Real-time listener: only show active products ──
  const q = query(collection(db, "products"), where("status", "==", "active"));

  onSnapshot(
    q,
    (snapshot) => {
      container.innerHTML = "";

      if (snapshot.empty) {
        container.innerHTML = `
          <div style="grid-column:1/-1; text-align:center; padding:3rem; background:#fff; border-radius:0.75rem; border:1px dashed #d1d5db;">
            <i class="fas fa-store-slash" style="font-size:3rem; color:#9ca3af; display:block; margin-bottom:1rem;"></i>
            <p style="color:#6b7280; font-size:1.1rem; margin:0;">No products available right now.</p>
            <p style="color:#9ca3af; margin:0.5rem 0 0; font-size:0.85rem;">Check back soon — sellers are adding products!</p>
          </div>
        `;
        return;
      }

      // Build all cards in a fragment for performance
      const fragment = document.createDocumentFragment();

      snapshot.forEach((docSnap) => {
        const product = docSnap.data();
        const id = docSnap.id;

        // Support both imageURL (from seller.js) and image (from index.js)
        const imgSrc =
          product.imageUrl || product.imageURL || product.image || "";
        const priceFormatted = product.price
          ? Number(product.price).toLocaleString("en-NG")
          : "0";
        const shortDesc = product.description
          ? product.description.substring(0, 90) +
            (product.description.length > 90 ? "..." : "")
          : "";

        const card = document.createElement("div");
        card.className = "shop-product-card";
        card.style.cssText = `
          background:#fff;
          border-radius:0.75rem;
          overflow:hidden;
          box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);
          display:flex;
          flex-direction:column;
          transition:transform 0.2s, box-shadow 0.2s;
          cursor:pointer;
        `;

        card.onmouseenter = () => {
          card.style.transform = "translateY(-4px)";
          card.style.boxShadow = "0 12px 20px -3px rgba(0,0,0,0.12)";
        };
        card.onmouseleave = () => {
          card.style.transform = "translateY(0)";
          card.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.08)";
        };

        card.innerHTML = `
          <div style="position:relative;">
            <img
              src="${imgSrc}"
              alt="${escapeHtml(product.name)}"
              style="width:100%; height:220px; object-fit:cover; border-bottom:1px solid #f3f4f6; display:block;"
              onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'"
            >
            ${
              product.category
                ? `<span style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.65); color:#fff; padding:3px 10px; border-radius:999px; font-size:0.72rem; font-weight:600;">${escapeHtml(product.category)}</span>`
                : ""
            }
          </div>
          <div style="padding:1.1rem; flex-grow:1; display:flex; flex-direction:column;">
            <h3 style="margin:0 0 0.4rem; font-size:1rem; color:#111827; font-weight:600; line-height:1.3;">${escapeHtml(product.name)}</h3>
            <p style="margin:0 0 0.8rem; color:#6b7280; font-size:0.85rem; flex-grow:1; line-height:1.5;">${escapeHtml(shortDesc)}</p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:0.75rem; border-top:1px solid #f3f4f6;">
              <span style="font-weight:700; font-size:1.2rem; color:#ff6600;">₦${priceFormatted}</span>
              <button
                class="buy-btn"
                data-id="${id}"
                data-name="${escapeHtml(product.name)}"
                data-price="${product.price}"
                style="
                  background:#ff6600;
                  color:#fff;
                  border:none;
                  padding:0.55rem 1.1rem;
                  border-radius:0.5rem;
                  cursor:pointer;
                  font-weight:600;
                  font-size:0.85rem;
                  display:flex;
                  align-items:center;
                  gap:0.4rem;
                  transition:background 0.2s;
                "
                onmouseover="this.style.background='#e55a00'"
                onmouseout="this.style.background='#ff6600'"
              >
                <i class="fas fa-shopping-cart"></i> Buy Now
              </button>
            </div>
          </div>
        `;

        fragment.appendChild(card);
      });

      container.appendChild(fragment);

      // ── Attach buy button listeners ──
      container.querySelectorAll(".buy-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const target = e.target.closest(".buy-btn");
          const productId = target.dataset.id;
          const productName = target.dataset.name;

          // Navigate to product page or checkout
          // Adjust href to match your actual product/checkout page:
          window.location.href = `product.html?id=${productId}`;
        });
      });
    },
    (error) => {
      console.error("shop.js onSnapshot error:", error);
      container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:2rem; background:#fee2e2; border-radius:0.75rem; border:1px solid #fecaca; color:#dc2626;">
          <i class="fas fa-exclamation-triangle" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
          <p style="margin:0; font-weight:500;">Error loading products. Please refresh the page or try again later.</p>
        </div>
      `;
    },
  );
});

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
