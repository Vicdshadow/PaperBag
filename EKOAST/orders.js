// orders.js
import {
  auth,
  db,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onAuthStateChanged,
} from "./firebase-config.js";

const container = document.getElementById("ordersContainer");
const tabOngoing = document.getElementById("tabOngoing");
const tabCanceled = document.getElementById("tabCanceled");
const orderSearch = document.getElementById("orderSearch");

let allOrders = [];
let currentFilter = "ongoing"; // "ongoing" or "canceled"

function getStatusLabel(status) {
  if (!status) return "PENDING";
  const s = status.toLowerCase();
  if (s === "escrow") return "PAID - PROCESSING";
  if (s === "verified") return "PAYMENT VERIFIED";
  if (s === "released") return "DELIVERED";
  return s.toUpperCase();
}

async function loadOrders(user) {
  try {
    const q = query(
      collection(db, "orders"),
      where("buyerId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    allOrders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderFilteredOrders();
  } catch (err) {
    console.error("Error loading orders:", err);
    container.innerHTML = `<div class="empty-state"><p>Error loading orders. Please refresh.</p></div>`;
  }
}

function renderFilteredOrders() {
  container.innerHTML = "";

  const filtered = allOrders.filter((o) => {
    const status = (o.status || "pending").toLowerCase();
    const isCanceled = status === "canceled" || status === "returned";

    // Search filter
    const searchMatch =
      !orderSearch.value ||
      o.items.some((i) =>
        i.name.toLowerCase().includes(orderSearch.value.toLowerCase()),
      ) ||
      o.id.includes(orderSearch.value);

    if (!searchMatch) return false;

    if (currentFilter === "ongoing") return !isCanceled;
    return isCanceled;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-box-open"></i>
        <p>You have no ${currentFilter} orders.</p>
      </div>`;
    return;
  }

  filtered.forEach((o) => {
    const mainItem = o.items[0] || {
      name: "Unknown Item",
      img: "assets/images/placeholder.svg",
    };
    const dateStr = o.createdAt
      ? o.createdAt
          .toDate()
          .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })
      : "Recently";

    // Status style
    let statusClass = "status-ongoing";
    if (o.status === "delivered" || o.status === "released")
      statusClass = "status-delivered";
    if (o.status === "canceled" || o.status === "returned")
      statusClass = "status-canceled";

    const card = document.createElement("div");
    card.className = "order-card animate-fade-in";
    card.innerHTML = `
      <img src="${mainItem.image || mainItem.img || "assets/images/placeholder.svg"}" class="order-img" />
      <div class="order-info">
        <div class="order-name">${mainItem.name} ${o.items.length > 1 ? `(+${o.items.length - 1} more)` : ""}</div>
        <div class="order-ref">Order #${o.id.slice(-6)}</div>
        <div class="status-pill ${statusClass}">${getStatusLabel(o.status)}</div>
        <div class="order-date">On ${dateStr}</div>
      </div>
      <div style="display: flex; align-items: center; color: #111116; font-size: 14px;">
        <i class="fas fa-chevron-right"></i>
      </div>
    `;

    card.onclick = () => {
      window.location.href = `track-order.html?id=${o.id}`;
    };

    container.appendChild(card);
  });
}

// Event Listeners
tabOngoing.addEventListener("click", () => {
  currentFilter = "ongoing";
  tabOngoing.classList.add("active");
  tabCanceled.classList.remove("active");
  renderFilteredOrders();
});

tabCanceled.addEventListener("click", () => {
  currentFilter = "canceled";
  tabCanceled.classList.add("active");
  tabOngoing.classList.remove("active");
  renderFilteredOrders();
});

orderSearch.addEventListener("input", renderFilteredOrders);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadOrders(user);
});

