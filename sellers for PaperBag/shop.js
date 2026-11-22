import {
  auth,
  db,
  collection,
  addDoc,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
} from "./firebase-config.js";

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

function getConditionLabel(product) {
  const raw = product.condition || inferConditionFromDescription(product.description);
  return raw === "preowned" ? "Preowned" : "Brand New";
}

// Ensure the host page has a container with id="shop-products-container"
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("shop-products-container");

  if (!container) {
    console.warn(
      "shop.js is running, but no element with id 'shop-products-container' found on the page.",
    );
    return;
  }

  // Query active products ordered by newest first
  const q = query(
    collection(db, "products"),
    where("status", "==", "active"),
    orderBy("createdAt", "desc"),
  );

  // Initial Loading State
  container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #55555e;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem; color: #2563eb;"></i>
            <p>Loading latest products...</p>
        </div>
    `;

  // Real-time listener for products
  onSnapshot(
    q,
    (snapshot) => {
      container.innerHTML = "";

      if (snapshot.empty) {
        container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #fff; border-radius: 0.75rem; border: 1px dashed #d4d4da;">
                    <i class="fas fa-store-slash" style="font-size: 3rem; color: #72727b; margin-bottom: 1rem;"></i>
                    <p style="color: #55555e; font-size: 1.1rem; margin: 0;">No active products available at the moment.</p>
                </div>
            `;
        return;
      }

      const fragment = document.createDocumentFragment();

      snapshot.forEach((docSnap) => {
        const product = docSnap.data();
        const id = docSnap.id;
        const conditionLabel = getConditionLabel(product);

        const card = document.createElement("div");
        card.className = "shop-product-card";

        // Inline styling fallback in case external CSS is missing the class
        card.style.cssText = `
                background-color: #ffffff;
                border-radius: 0.75rem;
                overflow: hidden;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                display: flex;
                flex-direction: column;
                transition: transform 0.2s, box-shadow 0.2s;
                height: 100%;
            `;

        // Mouse hover effects via JS since styles are inline
        card.onmouseenter = () => {
          card.style.transform = "translateY(-4px)";
          card.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
        };
        card.onmouseleave = () => {
          card.style.transform = "translateY(0)";
          card.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
        };

        card.innerHTML = `
                <div style="position: relative;">
                    <img src="${product.imageURL || product.image || ""}" alt="${product.name}" style="width: 100%; height: 220px; object-fit: cover; border-bottom: 1px solid #f1f1f4;" onerror="this.src='assets/images/placeholder.svg'">
                    ${product.category ? `<span style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 500;">${product.category}</span>` : ""}
                </div>
                <div style="padding: 1.25rem; flex-grow: 1; display: flex; flex-direction: column;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem; color: #111116; font-weight: 600;">${product.name}</h3>
                    <span style="display:inline-block; width: fit-content; margin: 0 0 0.75rem 0; padding: 0.2rem 0.55rem; border-radius: 999px; background: ${conditionLabel === "Preowned" ? "#fff7ed" : "#ecfdf5"}; color: ${conditionLabel === "Preowned" ? "#9a3412" : "#065f46"}; font-size: 0.75rem; font-weight: 600;">${conditionLabel}</span>
                    <p style="margin: 0 0 1rem 0; color: #55555e; font-size: 0.9rem; flex-grow: 1; line-height: 1.5;">
                        ${product.description ? product.description.substring(0, 90) + (product.description.length > 90 ? "..." : "") : ""}
                    </p>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 1rem; border-top: 1px solid #f1f1f4;">
                        <span style="font-weight: 700; font-size: 1.25rem; color: #2563eb;">₦${product.price ? product.price.toLocaleString() : "0"}</span>
                        <button class="buy-btn" data-id="${id}" style="
                            background: #2563eb; 
                            color: white; 
                            border: none; 
                            padding: 0.6rem 1.2rem; 
                            border-radius: 0.5rem; 
                            cursor: pointer; 
                            font-weight: 600;
                            font-size: 0.9rem;
                            transition: background-color 0.2s;
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                        " onmouseover="this.style.backgroundColor='#1d4ed8'" onmouseout="this.style.backgroundColor='#2563eb'">
                            <i class="fas fa-shopping-cart"></i> Buy Now
                        </button>
                    </div>
                </div>
            `;

        fragment.appendChild(card);
      });

      container.appendChild(fragment);

      // Attach event listeners for buyer interaction
      const buyButtons = container.querySelectorAll(".buy-btn");
      buyButtons.forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const target = e.target.closest(".buy-btn");
          const productId = target.getAttribute("data-id");
          const selected = snapshot.docs.find((d) => d.id === productId);
          if (!selected) {
            alert("This product is no longer available.");
            return;
          }

          const productData = selected.data();
          const qtyInput = window.prompt("Enter quantity to buy:", "1");
          if (qtyInput === null) return;

          const qty = Number(qtyInput);
          if (!Number.isInteger(qty) || qty < 1) {
            alert("Please enter a valid quantity (1 or more).");
            return;
          }

          const buyer = auth.currentUser;
          if (!buyer) {
            alert("Please log in before placing an order.");
            return;
          }

          try {
            const sellerSnap = await getDoc(doc(db, "users", productData.sellerId));
            const sellerName = sellerSnap.exists()
              ? sellerSnap.data().name || sellerSnap.data().shopName || "Seller"
              : "Seller";

            const unitPrice = Number(productData.price || 0);
            const amount = unitPrice * qty;

            const orderPayload = {
              buyerId: buyer.uid,
              buyerEmail: buyer.email || "",
              sellerId: productData.sellerId || "",
              sellerName,
              productId,
              productName: productData.name || "Product",
              amount,
              qty,
              unitPrice,
              status: "pending",
              paymentStatus: "paid",
              paymentMethod: "wallet",
              amount: amount,
              paymentStatus: "processing",
              items: [
                {
                  productId,
                  name: productData.name || "Product",
                  sellerId: productData.sellerId || "",
                  qty,
                  price: unitPrice,
                  amount,
                },
              ],
              createdAt: serverTimestamp(),
              paymentConfirmedAt: serverTimestamp(),
            };

            await addDoc(collection(db, "orders"), orderPayload);
            alert(`Order placed successfully for ₦${amount.toLocaleString()}. We will notify you when payment is confirmed.`);
          } catch (err) {
            console.error("Order placement error:", err);
            alert("Failed to place order: " + (err?.message || "Unknown error"));
          }
        });
      });
    },
    (error) => {
      console.error("Error fetching shop products:", error);
      container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; background: #fee2e2; border-radius: 0.75rem; border: 1px solid #fecaca; color: #b42318;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p style="margin: 0; font-weight: 500;">Error loading products. Please try again later.</p>
            </div>
        `;
    },
  );
});

