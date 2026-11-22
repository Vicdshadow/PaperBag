// cart.js
import { db, auth } from "./firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

const listEl = document.getElementById("cartItemsList");
const subtotalEl = document.getElementById("subtotal");
const totalEl = document.getElementById("total");
const checkoutBtn = document.querySelector('a[href="checkout.html"]');

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  loadCart();
});

// Intercept Checkout Click
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", (e) => {
    if (!currentUser) {
      e.preventDefault();
      alert("Please login to proceed to checkout.");
      window.location.href = "login.html?redirect=checkout";
    } else {
      console.log("Proceeding to checkout...");
    }
  });
}

async function loadCart() {
  listEl.innerHTML = "Loading...";
  let items = [];

  if (currentUser) {
    // Load from Firestore
    const snap = await getDocs(
      collection(db, "users", currentUser.uid, "cart"),
    );
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    // Load from LocalStorage (Guest)
    items = JSON.parse(localStorage.getItem("guest_cart") || "[]");
  }

  renderCart(items);
}

function renderCart(items) {
  listEl.innerHTML = "";
  let total = 0;

  if (items.length === 0) {
    listEl.innerHTML = "<p>Your bag is empty.</p>";
    updateTotals(0);
    return;
  }

  items.forEach((item) => {
    total += item.price * item.qty;

    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
       <img src="${item.image || ""}" class="cart-img" alt="${item.name}">
       <div class="cart-details">
         <div class="cart-name">${item.name}</div>
         <div class="cart-price">₦${item.price.toLocaleString()}</div>
         
         <div class="cart-controls">
            <div class="qty-control h-flex">
                <button class="qty-btn minus">-</button>
                <span style="padding: 0 10px;">${item.qty}</span>
                <button class="qty-btn plus">+</button>
            </div>
            <button class="remove-btn">Remove</button>
         </div>
       </div>
       <div class="cart-item-total">
          ₦${(item.price * item.qty).toLocaleString()}
       </div>
    `;

    // Bind events
    div.querySelector(".minus").onclick = () =>
      updateQty(item.id, item.qty - 1);
    div.querySelector(".plus").onclick = () => updateQty(item.id, item.qty + 1);
    div.querySelector(".remove-btn").onclick = () => removeItem(item.id);

    listEl.appendChild(div);
  });

  updateTotals(total);
}

function updateTotals(amount) {
  if (subtotalEl) subtotalEl.textContent = "₦" + amount.toLocaleString();
  if (totalEl) totalEl.textContent = "₦" + amount.toLocaleString();
}

async function updateQty(itemId, newQty) {
  if (newQty < 1) return;

  if (currentUser) {
    const ref = doc(db, "users", currentUser.uid, "cart", itemId);
    await updateDoc(ref, { qty: newQty });
  } else {
    // Update Guest Cart
    const cart = JSON.parse(localStorage.getItem("guest_cart") || "[]");
    const idx = cart.findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      cart[idx].qty = newQty;
      localStorage.setItem("guest_cart", JSON.stringify(cart));
    }
  }
  loadCart();
}

async function removeItem(itemId) {
  if (!confirm("Remove this item?")) return;

  if (currentUser) {
    const ref = doc(db, "users", currentUser.uid, "cart", itemId);
    await deleteDoc(ref);
  } else {
    // Remove from Guest Cart
    const cart = JSON.parse(localStorage.getItem("guest_cart") || "[]");
    const newCart = cart.filter((i) => i.id !== itemId);
    localStorage.setItem("guest_cart", JSON.stringify(newCart));
  }
  loadCart();
}

