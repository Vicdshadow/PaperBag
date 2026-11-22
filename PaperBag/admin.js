// admin.js
import {
  auth,
  db,
  STATUS_PROCESSING,
  STATUS_VERIFIED,
  STATUS_COMPLETED,
  collection,
  query,
  orderBy,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onAuthStateChanged,
  signOut,
  serverTimestamp,
  functions,
  httpsCallable,
  onSnapshot, // ✅ Added missing import
  ADMIN_EMAILS,
  isAdminEmail,
} from "./firebase-config.js";
import {
  getLocalStoredProducts,
  deleteLocalProduct,
} from "./display-products.js";

// Expose these to global scope for the refresh logic in delete/edit
window.fetchAllProducts = fetchAllProducts;
window.fetchLocalProducts = fetchLocalProducts;
window.getLocalStoredProducts = getLocalStoredProducts;

const ADMIN_API_URL = "http://localhost:3001";

/**
 * Helper to call the secure Admin backend
 */
async function callAdminAPI(endpoint, method = "POST", body = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user.");

  try {
    const idToken = await user.getIdToken(true);
    const response = await fetch(`${ADMIN_API_URL}${endpoint}`, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "API Request failed");
    return result;
  } catch (err) {
    console.error(`Admin API Error (${endpoint}):`, err);
    throw err;
  }
}

const orderListEl = document.getElementById("adminOrderList");
const userListEl = document.getElementById("adminUserList");
const productListEl = document.getElementById("adminProductList");
const reviewListEl = document.getElementById("adminReviewList");
const paidOrdersTotalEl = document.getElementById("paidOrdersTotal");
const pendingCountEl = document.getElementById("pendingCount");
const releasedTotalEl = document.getElementById("releasedTotal");
const totalBuyersCountEl = document.getElementById("totalBuyersCount");
const unreadChatsCountEl = document.getElementById("unreadChatsCount");
const recentAccountsListEl = document.getElementById("recentAccountsList");
const logoutBtn = document.getElementById("logoutBtn");

function formatDate(value) {
  if (!value) return "N/A";
  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleDateString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString();
}

function getOrderStatusLabel(status) {
  if (!status) return "PENDING";
  const s = status.toLowerCase();
  if (s === STATUS_PROCESSING) return "AWAITING PAYMENT VERIFICATION";
  if (s === STATUS_VERIFIED) return "PAYMENT VERIFIED";
  if (s === STATUS_COMPLETED) return "DELIVERED";
  return s.toUpperCase();
}
// Tab Logic
// Tab Logic - Removed for Multi-page setup
// document.querySelectorAll(".tab-btn").forEach((btn) => { ... });

// Admin Check
async function requireAdmin(user) {
  if (!user) {
    console.log("No user session. Redirecting to login.");
    window.location.href = "login.html";
    return false;
  }

  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  const isMasterAdmin = isAdminEmail(email);
  let tokenRole = "";
  try {
    const token = await user.getIdTokenResult(true);
    tokenRole = String(token.claims.role || "").toLowerCase();
  } catch (error) {
    console.warn("Could not read admin token claim:", error);
  }

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.data();
    const role = String(userData?.role || "").toLowerCase();
    const hasAdminRole =
      role === "admin" || role === "super-admin" || role === "sub-admin";

    if (!isMasterAdmin && !hasAdminRole && tokenRole !== "admin") {
      console.warn("Unauthorized access attempt:", user.email);
      alert("Admin Access Only");
      window.location.href = "index.html";
      return false;
    }
    console.log("Admin authorized:", user.email);
    return true;
  } catch (err) {
    console.error("Admin check Firestore error:", err);
    // ✅ CRITICAL: If they are the master admin, allow them to stay even if Firestore is being flaky
    if (isMasterAdmin) {
      console.log("Master Admin authorized (Firestore bypass).");
      return true;
    }
    window.location.href = "index.html";
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const isAuthorized = await requireAdmin(user);
  if (!isAuthorized) return;

  // Set basic UI info immediately
  const emailDisplay = document.getElementById("adminEmail");
  if (emailDisplay) emailDisplay.textContent = `${user.email}`;

  // RESOLVE SUB-ADMIN ROLE (Non-blocking)
  getDoc(doc(db, "users", user.uid))
    .then((userDoc) => {
      const userData = userDoc.data();
      const isSubAdmin = userData?.role === "sub-admin";

      if (isSubAdmin) {
        applySubAdminRestrictions();
      }
    })
    .catch((error) => {
      console.warn("Could not resolve admin role metadata:", error);
    });

  // Start Listeners
  initializeDashboardListeners();
});

function applySubAdminRestrictions() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const text = btn.textContent.toLowerCase();
    if (
      !text.includes("chats") &&
      !text.includes("overview") &&
      !text.includes("reports")
    ) {
      btn.style.display = "none";
    }
  });

  const page = window.location.pathname;
  if (
    page.includes("admin-sales") ||
    page.includes("admin-users") ||
    page.includes("admin-inventory") ||
    page.includes("admin-subadmins")
  ) {
    alert("Access restricted to Chat Management.");
    window.location.href = "admin-chats.html";
  }
}

function initializeDashboardListeners() {
  // Conditional Listeners based on page content
  if (
    document.getElementById("adminOrderList") ||
    document.getElementById("paidOrdersTotal")
  ) {
    listenToOrders();
  }

  if (document.getElementById("adminUserList")) {
    listenToUsers();
  }

  if (document.getElementById("adminSuperUserList")) {
    listenToSuperUsers();
  }

  if (document.getElementById("adminProductList")) {
    listenToProducts();
    if (typeof setupProductEditModal === "function") setupProductEditModal();
  }

  if (document.getElementById("adminReviewList")) {
    listenToReviews();
  }

  if (document.getElementById("adminVoucherList")) {
    listenToVouchers();
  }

  if (document.getElementById("adminPayoutList")) {
    listenToPayoutRequests();
  }

  // "Command Center" / Overview specific: needs everything for stats
  if (document.getElementById("systemAlertsList")) {
    // If we are on the main dashboard, we might want to listen to everything to populate alerts/stats
    // even if the tables aren't here.
    // Let's ensure we don't double-listen if we already did above.
    // For simplicity in this mock setup, calling listenX again is fine (it just sets up onSnapshot),
    // but let's be cleaner.
    if (!document.getElementById("adminOrderList")) listenToOrders();
    if (!document.getElementById("adminUserList")) listenToUsers();
    if (!document.getElementById("adminReviewList")) listenToReviews();
    if (!document.getElementById("adminChatList")) listenToConversations();
  }
}

// --- NOTIFICATION SYSTEM ---
const shownOrderIds = new Set();
const shownUserIds = new Set();
const shownReviewIds = new Set();
const shownConversationIds = new Set();
const conversationUnreadCache = new Map();
let isOrdersInitialLoad = true;
let isUsersInitialLoad = true;
let isReviewsInitialLoad = true;
let isConversationsInitialLoad = true;

function showToastNotification(title, message, onClickUrl) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "admin-toast";
  toast.innerHTML = `
        <div class="toast-icon"><i class="fas fa-bell"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

  if (onClickUrl) {
    toast.style.cursor = "pointer";
    toast.addEventListener("click", (e) => {
      if (!e.target.closest(".toast-close")) {
        window.location.href = onClickUrl;
      }
    });
  }

  toast.querySelector(".toast-close").addEventListener("click", () => {
    toast.remove();
  });

  container.appendChild(toast);

  // Auto remove after 10 seconds
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 10000);
}

// --- RENDERERS & LISTENERS ---

function renderSystemAlerts(
  pendingSellers,
  flaggedReviews,
  pendingPayments,
  unreadChats,
) {
  const alertsContainer = document.getElementById("systemAlertsList");
  if (!alertsContainer) return;

  alertsContainer.innerHTML = "";
  let hasAlerts = false;

  if (pendingSellers > 0) {
    hasAlerts = true;
    alertsContainer.innerHTML += `
      <div class="alert-item" onclick="window.location.href='admin-users.html'">
        <i class="fas fa-user-clock" style="color: #dd6b20;"></i>
        <span><strong>${pendingSellers} Seller(s)</strong> awaiting approval.</span>
      </div>`;
  }

  if (flaggedReviews > 0) {
    hasAlerts = true;
    alertsContainer.innerHTML += `
      <div class="alert-item" onclick="window.location.href='admin-reviews.html'">
        <i class="fas fa-flag" style="color: #b42318;"></i>
        <span><strong>${flaggedReviews} Review(s)</strong> flagged for low rating.</span>
      </div>`;
  }

  if (pendingPayments > 0) {
    hasAlerts = true;
    alertsContainer.innerHTML += `
      <div class="alert-item" onclick="window.location.href='admin-sales.html'">
        <i class="fas fa-money-check-alt" style="color: #2b6cb0;"></i>
        <span><strong>${pendingPayments} Order(s)</strong> Pending Payment Confirmation.</span>
      </div>`;
  }

  if (unreadChats > 0) {
    hasAlerts = true;
    alertsContainer.innerHTML += `
      <div class="alert-item" onclick="window.location.href='admin-chats.html'">
        <i class="fas fa-comments" style="color: #2f855a;"></i>
        <span><strong>${unreadChats} Unread Message(s)</strong> waiting in Chat Management.</span>
      </div>`;
  }

  if (!hasAlerts) {
    alertsContainer.innerHTML = `<div class="muted" style="padding: 10px 0;">All systems normal. No pending actions.</div>`;
  }
}

// Stats aggregators
let stats = {
  pendingPayments: 0,
  pendingSellers: 0,
  flaggedReviews: 0,
  unreadChats: 0,
};

function updateDashboardAlerts() {
  renderSystemAlerts(
    stats.pendingSellers,
    stats.flaggedReviews,
    stats.pendingPayments,
    stats.unreadChats,
  );
}

function listenToOrders() {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snap) => {
    let orderList = [];
    let paidOrdersTotal = 0;
    let releasedTotal = 0;
    let pendingVerifications = 0;

    snap.forEach((d) => {
      const o = { id: d.id, ...d.data() };
      orderList.push(o);

      if (o.status === STATUS_PROCESSING) {
        paidOrdersTotal += o.amount || 0;
        pendingVerifications++;

        // Notify if it's a new order and we are past the initial data load
        if (!isOrdersInitialLoad && !shownOrderIds.has(o.id)) {
          showToastNotification(
            "New Payment Confirmation Required",
            `Order #${o.id.slice(-6)} - ₦${(o.amount || 0).toLocaleString()} via Bank Transfer`,
            "admin-sales.html",
          );
        }
        shownOrderIds.add(o.id);
      } else if (o.status === STATUS_COMPLETED) {
        releasedTotal += o.amount || 0;
      } else if (o.status === STATUS_VERIFIED) {
        paidOrdersTotal += o.amount || 0;
      }
    });

    // After first snapshot pass, mark initial load as done
    isOrdersInitialLoad = false;

    stats.pendingPayments = pendingVerifications;
    updateDashboardAlerts();

    renderOrders(orderList);
    updateStats(paidOrdersTotal, pendingVerifications, releasedTotal);
  });
}

function listenToUsers() {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const list = [];
    let pendingSellers = 0;
    snap.forEach((d) => {
      const u = { id: d.id, ...d.data() };
      list.push(u);
      const isSellerRole = u.role === "seller" || u.role === "host";
      if (isSellerRole && u.status === "pending") {
        pendingSellers++;
      }

      if (isUsersInitialLoad) {
        shownUserIds.add(u.id);
      } else if (!shownUserIds.has(u.id)) {
        const roleLabel =
          u.role === "seller" || u.role === "host" ? "Seller" : "Buyer";
        showToastNotification(
          "New Account Created",
          `${u.fullName || u.email || "New user"} joined as ${roleLabel}.`,
          "admin-users.html",
        );
        shownUserIds.add(u.id);
      }
    });

    isUsersInitialLoad = false;

    stats.pendingSellers = pendingSellers;
    updateDashboardAlerts();

    // Update "Total Sellers" count
    const sellerCount = list.filter(
      (u) => u.role === "seller" || u.role === "host",
    ).length;
    const countEl = document.getElementById("totalSellersCount");
    if (countEl) {
      countEl.textContent = sellerCount;
      countEl.previousElementSibling.textContent = "Total Sellers";
    }

    const buyerCount = list.filter(
      (u) =>
        !u.role ||
        (u.role !== "seller" && u.role !== "host" && u.role !== "admin"),
    ).length;
    if (totalBuyersCountEl) {
      totalBuyersCountEl.textContent = buyerCount;
    }

    renderRecentAccounts(list);
    renderUsers(list);
  });
}

// Similar to listenToUsers but designed for the Super Admin panel
function listenToSuperUsers() {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const list = [];
    let suspendedCount = 0;
    snap.forEach((d) => {
      const u = { id: d.id, ...d.data() };
      list.push(u);
      if (u.status === "suspended") suspendedCount++;
    });

    const countEl = document.getElementById("suspendedCount");
    if (countEl) countEl.textContent = suspendedCount;

    renderSuperUsers(list);
  });
}

function listenToProducts() {
  let firebaseProducts = [];
  const refreshInventory = async () => {
    try {
      console.log("Refreshing inventory...");
      let localProducts = [];
      try {
        localProducts = await fetchLocalProducts();
        console.log(`Loaded ${localProducts.length} local products.`);
      } catch (localErr) {
        console.warn("Failed fetchLocalProducts, using fallback:", localErr);
        localProducts = (window.getLocalStoredProducts() || []).map((p) => ({
          ...p,
          source: "local",
        }));
      }

      const merged = [...firebaseProducts, ...localProducts];
      const seen = new Set();
      const deduped = merged.filter((item) => {
        const id = String(item.id || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      console.log(`Rendering ${deduped.length} total products.`);
      renderProducts(deduped);
    } catch (error) {
      console.error("Critical failure in refreshInventory:", error);
      if (productListEl) {
        productListEl.innerHTML =
          '<tr><td colspan="6" class="muted">Error rendering product list. Check console.</td></tr>';
      }
    }
  };

  const q = query(collection(db, "products"));
  onSnapshot(
    q,
    (snap) => {
      firebaseProducts = [];
      snap.forEach((d) =>
        firebaseProducts.push({
          id: d.id,
          ...d.data(),
          source: "firebase",
        }),
      );
      console.log(`Sync: ${firebaseProducts.length} firebase products.`);
      refreshInventory();
    },
    (error) => {
      console.warn(
        "Firebase listener inactive (typical for new setup):",
        error,
      );
      refreshInventory();
    },
  );

  window.addEventListener("storage", (event) => {
    if (event.key === "paperbag_local_products") refreshInventory();
  });

  refreshInventory();
}

function listenToReviews() {
  const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const list = [];
    let flagged = 0;
    snap.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      list.push(r);
      if (r.rating <= 2) flagged++;

      if (isReviewsInitialLoad) {
        shownReviewIds.add(r.id);
      } else if (!shownReviewIds.has(r.id)) {
        showToastNotification(
          "New Review Received",
          `${r.productName || "Product"} rated ${r.rating || 0}/5`,
          "admin-reviews.html",
        );
        shownReviewIds.add(r.id);
      }
    });

    isReviewsInitialLoad = false;

    stats.flaggedReviews = flagged;
    updateDashboardAlerts();

    renderReviews(list);
  });
}

function listenToVouchers() {
  const q = query(collection(db, "vouchers"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    renderVouchers(list);
  });
}

function listenToConversations() {
  const q = query(
    collection(db, "conversations"),
    orderBy("updatedAt", "desc"),
  );

  onSnapshot(q, (snapshot) => {
    let totalUnread = 0;

    snapshot.forEach((docSnap) => {
      const conv = docSnap.data();
      totalUnread += conv.unreadCount?.admin || 0;
    });

    stats.unreadChats = totalUnread;
    if (unreadChatsCountEl) unreadChatsCountEl.textContent = totalUnread;
    updateDashboardAlerts();

    snapshot.docChanges().forEach((change) => {
      const conv = { id: change.doc.id, ...change.doc.data() };
      const unread = conv.unreadCount?.admin || 0;
      const previousUnread = conversationUnreadCache.get(conv.id) || 0;
      conversationUnreadCache.set(conv.id, unread);

      if (isConversationsInitialLoad) {
        shownConversationIds.add(conv.id);
        return;
      }

      const otherUserId =
        conv.participants?.find((id) => id !== "admin") || "user";
      const otherName =
        conv.participantNames?.[otherUserId] ||
        (conv.type === "seller" ? "Seller" : "User");

      if (change.type === "added" && !shownConversationIds.has(conv.id)) {
        showToastNotification(
          "New Support Chat",
          `${otherName} started a ${conv.type || "support"} chat.`,
          "admin-chats.html",
        );
        shownConversationIds.add(conv.id);
        return;
      }

      if (change.type === "modified" && unread > previousUnread) {
        showToastNotification(
          "New Chat Message",
          `Message from ${otherName}.`,
          "admin-chats.html",
        );
      }
    });

    if (isConversationsInitialLoad) {
      isConversationsInitialLoad = false;
    }
  });
}

// --- RENDERERS ---

function renderOrders(orders) {
  if (!orderListEl) return;
  orderListEl.innerHTML = "";
  orders.forEach((o) => {
    const tr = document.createElement("tr");
    const statusClass = `status-${o.status}`;
    const statusLabel = getOrderStatusLabel(o.status);

    tr.innerHTML = `
            <td>#${o.id.slice(-6)}</td>
            <td>
                <div style="font-weight: 600;">${o.buyerEmail}</div>
                <div class="muted" style="font-size: 11px;">Ref: ${o.paymentRef || "N/A"}</div>
            </td>
            <td style="font-weight: 700;">₦${(o.amount || 0).toLocaleString()}</td>
            <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
            <td class="action-btns">
                ${o.status === STATUS_PROCESSING ? `<button class="btn-mini btn-primary" onclick="window.updateStatus('${o.id}', '${STATUS_VERIFIED}')">VERIFY</button>` : ""}
                ${o.status === STATUS_VERIFIED ? `<button class="btn-mini" style="background: #38a169; color: white;" onclick="window.updateStatus('${o.id}', 'shipped')">SHIP</button>` : ""}
                ${o.status === "shipped" ? `<button class="btn-mini" style="background: #3182ce; color: white;" onclick="window.updateStatus('${o.id}', 'nearby')">MARK NEARBY</button>` : ""}
                ${o.status === "nearby" ? `<button class="btn-mini" style="background: #805ad5; color: white;" onclick="window.updateStatus('${o.id}', '${STATUS_COMPLETED}')">MARK DELIVERED</button>` : ""}
                <button class="btn-mini btn-outline" style="border-color: #3182ce; color: #3182ce;" onclick="window.simulateMovement('${o.id}')"><i class="fas fa-map-marker-alt"></i> MOCK MOVE</button>
                <button class="btn-mini btn-outline" onclick="window.contactUser('${o.buyerEmail}')"><i class="fab fa-whatsapp"></i></button>
            </td>
        `;
    orderListEl.appendChild(tr);
  });
}

function renderUsers(users) {
  if (!userListEl) return;
  userListEl.innerHTML = "";
  users.forEach((u) => {
    // Determine status color
    let statusClass = "status-verified";
    if (u.status === "pending") statusClass = "status-pending"; // orange
    if (u.status === "suspended") statusClass = "status-released"; // reusing green for now but maybe red is better? let's stick to simple CSS
    // Actually let's use inline style for simple overrides
    let statusStyle = "";
    if (u.status === "suspended")
      statusStyle = "background: #fee2e2; color: #c53030;";

    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>
            <div style="font-weight: 600;">${u.fullName || "User"}</div>
            <div class="muted" style="font-size: 12px;">${u.email}</div>
        </td>
        <td style="text-transform: capitalize;">${u.role || "buyer"}</td>
        <td><span class="status-pill ${statusClass}" style="${statusStyle}">${(u.status || "active").toUpperCase()}</span></td>
        <td style="font-size: 12px;">${formatDate(u.createdAt)}</td>
         <td class="action-btns">
             <button class="btn-mini btn-outline" style="border-color: #ecc94b; color: #d69e2e;" onclick="window.sendWarning('${u.email}')">WARN</button>
             ${u.role === "seller" && u.status === "pending" ? `<button class="btn-mini btn-primary" onclick="window.approveSeller('${u.id}')">APPROVE</button>` : ""}
        </td>
    `;
    userListEl.appendChild(tr);
  });
}

function renderRecentAccounts(users) {
  if (!recentAccountsListEl) return;
  if (!users || users.length === 0) {
    recentAccountsListEl.innerHTML =
      '<div class="muted">No recent signups.</div>';
    return;
  }

  const items = users.slice(0, 6).map((u) => {
    const roleLabel =
      u.role === "seller" || u.role === "host" ? "Seller" : "Buyer";
    const created = formatDate(u.createdAt);
    return `
      <div class="alert-item" style="cursor: default;">
        <i class="fas fa-user-plus" style="color: #2b6cb0;"></i>
        <span><strong>${u.fullName || u.email || "New user"}</strong> joined as ${roleLabel} • ${created}</span>
      </div>`;
  });

  recentAccountsListEl.innerHTML = items.join("");
}

function renderSuperUsers(users) {
  const superListEl = document.getElementById("adminSuperUserList");
  if (!superListEl) return;

  superListEl.innerHTML = "";
  users.forEach((u) => {
    let statusClass = "status-verified";
    if (u.status === "pending") statusClass = "status-pending";

    let statusStyle = "";
    if (u.status === "suspended") {
      statusStyle = "background: #fee2e2; color: #c53030;";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>
            <div style="font-weight: 600;">${u.fullName || "User"}</div>
            <div class="muted" style="font-size: 12px;">${u.email}</div>
        </td>
        <td style="text-transform: capitalize;">${u.role || "buyer"}</td>
        <td><span class="status-pill ${statusClass}" style="${statusStyle}">${(u.status || "active").toUpperCase()}</span></td>
        <td class="action-btns">
             ${
               u.status !== "suspended"
                 ? `<button class="btn-mini btn-outline" style="border-color: #f97066; color: #c53030;" onclick="window.suspendUser('${u.id}')"><i class="fas fa-ban"></i> SUSPEND</button>`
                 : `<button class="btn-mini btn-outline" style="border-color: #38a169; color: #2f855a;" onclick="window.reactivateUser('${u.id}')"><i class="fas fa-undo"></i> RESTORE</button>`
             }
             <button class="btn-mini btn-outline" style="background: #b42318; color: white; border-color: #b42318;" onclick="window.deleteUser('${u.id}')"><i class="fas fa-trash"></i> NUKE</button>
        </td>
    `;
    superListEl.appendChild(tr);
  });
}

function renderProducts(products) {
  const productListEl = document.getElementById("adminProductList");
  if (!productListEl) return;
  productListEl.innerHTML = "";

  // Store products globally for editing
  window.currentProducts = products;

  if (!products || products.length === 0) {
    productListEl.innerHTML =
      '<tr><td colspan="6" class="muted">No products found in Firebase or local inventory.</td></tr>';
    return;
  }

  products.forEach((p) => {
    const tr = document.createElement("tr");
    const isSoldOut = p.soldOut === true;
    const itemStyle = isSoldOut
      ? "text-decoration: line-through; color: #9a9aa2;"
      : "";

    // Construct sub-category display if it exists
    let catDisplay = p.category || "Uncategorized";
    if (p.subCategory) {
      catDisplay += ` > ${p.subCategory}`;
    }
    const sourceLabel =
      String(p.source || "").toLowerCase() === "local" ? "Local" : "Firebase";

    tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${p.imageUrl || p.image || ""}" alt="${p.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #e6e6ea;" onerror="this.src='assets/images/placeholder.svg'">
                    <div style="font-weight: 600; ${itemStyle}">${p.name}</div>
                </div>
            </td>
            <td style="font-size: 13px;">${catDisplay}</td>
            <td class="muted" style="font-size: 11px;">${sourceLabel}</td>
            <td style="font-weight: 600;">₦${(p.price || 0).toLocaleString()}</td>
            <td>
                ${isSoldOut ? '<span class="status-pill status-expired">SOLD OUT</span>' : '<span class="status-pill status-active">IN STOCK</span>'}
            </td>
            <td class="action-btns">
                <button class="btn-mini btn-outline" style="border-color: #3182ce; color: #3182ce;" onclick="window.openEditProductModal('${p.id}')">EDIT</button>
                <button class="btn-mini btn-outline" style="color: #b42318; border-color: #feb2b2;" onclick="window.deleteProduct('${p.id}')">DELETE</button>
            </td>
        `;
    productListEl.appendChild(tr);
  });
}

function renderReviews(reviews) {
  if (!reviewListEl) return;
  reviewListEl.innerHTML = "";
  reviews.forEach((r) => {
    const isBad = r.rating <= 2;
    const tr = document.createElement("tr");
    if (isBad) tr.style.backgroundColor = "#fff5f5"; // Light red tint for bad reviews

    const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);

    tr.innerHTML = `
            <td>
                <div style="font-weight:600; font-size:13px;">${r.productName || "Product #" + r.productId}</div>
            </td>
            <td>${r.userName || "Anonymous"}</td>
            <td style="color: ${isBad ? "#b42318" : "#f6ad55"}; letter-spacing: 2px;">${stars}</td>
            <td style="max-width: 300px; font-size: 13px;">${r.comment}</td>
            <td>
                ${isBad ? `<button class="btn-mini btn-outline" style="color: #b42318; border-color: #feb2b2;" onclick="window.sendWarning('${r.userEmail || "User"}')">WARN USER</button>` : ""}
                <button class="btn-mini btn-outline" onclick="window.deleteReview('${r.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
    reviewListEl.appendChild(tr);
  });
}

function updateStats(processing, pending, completed) {
  if (paidOrdersTotalEl) paidOrdersTotalEl.textContent = `₦${processing.toLocaleString()}`;
  if (pendingCountEl) pendingCountEl.textContent = pending;
  if (releasedTotalEl)
    releasedTotalEl.textContent = `₦${completed.toLocaleString()}`;
}

function renderVouchers(vouchers) {
  const listEl = document.getElementById("adminVoucherList");
  if (!listEl) return;

  listEl.innerHTML = "";
  if (vouchers.length === 0) {
    listEl.innerHTML = `<tr><td colspan="5" class="muted">No vouchers generated yet.</td></tr>`;
    return;
  }

  vouchers.forEach((v) => {
    const isExpired = v.status === "expired" || v.status === "used";
    const statusClass = isExpired ? "status-expired" : "status-active";

    let valueStr =
      v.discountType === "percentage"
        ? `${v.discountValue}%`
        : `₦${v.discountValue.toLocaleString()}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td><strong>${v.id}</strong></td>
            <td>${valueStr}</td>
            <td>${v.assignedEmail || '<span class="muted">Anyone</span>'}</td>
            <td><span class="status-pill ${statusClass}">${v.status || "active"}</span></td>
            <td class="action-btns">
                ${!isExpired ? `<button class="btn-mini btn-outline" style="color: #b42318; border-color: #feb2b2;" onclick="window.deleteVoucher('${v.id}')">REVOKE</button>` : ""}
                <button class="btn-mini btn-outline" onclick="window.deleteVoucher('${v.id}', true)"><i class="fas fa-trash"></i></button>
            </td>
        `;
    listEl.appendChild(tr);
  });
}

function listenToPayoutRequests() {
  const q = query(collection(db, "payouts"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    renderPayoutRequests(list);
  });
}

function renderPayoutRequests(payouts) {
  const listEl = document.getElementById("adminPayoutList");
  if (!listEl) return;
  listEl.innerHTML = "";

  payouts.forEach((p) => {
    const tr = document.createElement("tr");
    const isPending = p.status === "pending";
    const statusStyle =
      p.status === "completed" ? "background: #d1fae5; color: #065f46;" : "";

    tr.innerHTML = `
      <td>${formatDate(p.createdAt)}</td>
      <td>
        <div style="font-weight:600;">${p.sellerEmail}</div>
        <div class="muted" style="font-size:11px;">ID: ${p.sellerId}</div>
      </td>
      <td style="font-weight:700;">₦${p.amount.toLocaleString()}</td>
      <td style="font-size:12px;">
        <strong>${p.details.bankName}</strong><br>
        ${p.details.accountNumber} - ${p.details.accountName}
      </td>
      <td>
        ${isPending ? `<button class="btn-mini btn-primary" style="background:#c2a15a;" onclick="window.approvePayout('${p.id}')">CONFIRM PAYOUT</button>` : `<span class="status-pill" style="${statusStyle}">PAID</span>`}
      </td>
    `;
    listEl.appendChild(tr);
  });
}

// --- GLOBAL ACTIONS ---

window.updateStatus = async (orderId, newStatus) => {
  try {
    const result = await callAdminAPI("/update-order-status", "POST", {
      orderId,
      status: newStatus,
    });
    alert(result.message);
  } catch (err) {
    alert("Failed to update status: " + err.message);
  }
};

window.approvePayout = async (payoutId) => {
  if (
    !confirm(
      "Are you sure you have manually transferred the funds to the seller's account?",
    )
  )
    return;
  try {
    // We update the payout status via a new endpoint or directly (since this is admin)
    // Using direct Firestore update for simplicity as this is a dashboard action
    await updateDoc(doc(db, "payouts", payoutId), {
      status: "completed",
      completedAt: serverTimestamp(),
    });
    alert("Payout marked as completed!");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

window.approveSeller = async (uid) => {
  try {
    const result = await callAdminAPI("/manage-user", "POST", {
      userId: uid,
      action: "reactivate", // Use 'reactivate' logic to set user as active
    });
    alert(result.message || "Seller Approved!");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

window.reactivateUser = async (uid) => {
  try {
    const result = await callAdminAPI("/manage-user", "POST", {
      userId: uid,
      action: "reactivate",
    });
    showToastNotification("Account Reactivated", result.message);
  } catch (err) {
    alert("Error reactivating: " + err.message);
  }
};

window.viewUserDetails = function (id) {
  alert("View user details for: " + id + "\n(Implement modal here)");
};

window.handleFreezeUser = async function (id, currentStatus) {
  const action = currentStatus === "suspended" ? "reactivate" : "suspend";
  if (
    !confirm(
      `Are you sure you want to ${action === "reactivate" ? "unfreeze" : "freeze"} this account?`,
    )
  )
    return;

  try {
    const result = await callAdminAPI("/manage-user", "POST", {
      userId: id,
      action: action,
    });

    showToastNotification("Account Updated", result.message, null);
  } catch (err) {
    console.error("Error freezing user:", err);
    alert("Failed to update user status: " + err.message);
  }
};

window.sendWarning = (email) => {
  // In a real app, this would send an email via cloud function
  // For local mock, we simulated it
  alert(
    `WARNING SENT to ${email}:\n\n"Your account has been flagged for suspicious activity or policy violations. Please adhere to community guidelines to avoid account suspension."`,
  );
};

window.deleteUser = async (uid) => {
  if (
    !confirm(
      "SUPER ADMIN ACTION: This will permanently delete the user and all associated data. Proceed?",
    )
  )
    return;
  try {
    const result = await callAdminAPI("/manage-user", "POST", {
      userId: uid,
      action: "delete",
    });
    alert(result.message);
  } catch (err) {
    alert("Error: " + err.message);
  }
};

window.suspendUser = async (uid) => {
  if (
    !confirm("Suspend this user? They will not be able to log in or transact.")
  )
    return;
  try {
    const result = await callAdminAPI("/manage-user", "POST", {
      userId: uid,
      action: "suspend",
    });
    alert(result.message);
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// Duplicate function removed

window.deleteProduct = async (pid) => {
  if (!confirm("Are you sure you want to permanently delete this product?"))
    return;

  const product = window.currentProducts?.find((p) => p.id === pid);
  if (product?.source === "local") {
    const removed = deleteLocalProduct(pid);
    if (removed) {
      alert("Local product deleted.");
      // Refresh the UI
      fetchAllProducts().then((merged) => renderProducts(merged));
    } else {
      alert("Local product could not be deleted.");
    }
    return;
  }

  try {
    const result = await callAdminAPI("/delete-product", "POST", {
      productId: pid,
    });
    alert(result.message);
    fetchAllProducts().then((merged) => renderProducts(merged));
  } catch (err) {
    alert("Failed to delete: " + err.message);
  }
};

// --- PRODUCT EDITING LOGIC ---
window.openEditProductModal = (pid) => {
  const overlay = document.getElementById("editModalOverlay");
  const product = window.currentProducts?.find((p) => p.id === pid);
  if (!product) return alert("Product data not found.");

  document.getElementById("editProductId").value = product.id;
  document.getElementById("editProductName").value = product.name;
  document.getElementById("editProductPrice").value = product.price || 0;
  document.getElementById("editProductDescription").value =
    product.description || "";
  document.getElementById("editProductSoldOut").checked =
    product.soldOut === true;

  // Try to match the select dropdown
  let selectValue = product.category || "Phones";
  if (product.subCategory) {
    selectValue = `${product.category}|${product.subCategory}`;
  }

  const catSelect = document.getElementById("editProductCategory");
  if (catSelect) {
    // Ensure option exists or fallback
    let optionExists = Array.from(catSelect.options).some(
      (opt) => opt.value === selectValue,
    );
    if (optionExists) {
      catSelect.value = selectValue;
    } else {
      // Add custom option if it wasn't there
      const newOpt = document.createElement("option");
      newOpt.value = selectValue;
      newOpt.text = selectValue.replace("|", " - ");
      catSelect.add(newOpt);
      catSelect.value = selectValue;
    }
  }

  // Set preview
  const previewImg = document.getElementById("editImagePreview");
  if (previewImg) {
    previewImg.src =
      product.imageUrl ||
      product.image ||
      "assets/images/placeholder.svg";
  }

  // Reset file input
  const fileInput = document.getElementById("editProductImage");
  if (fileInput) fileInput.value = "";

  if (overlay) overlay.classList.add("active");
};

function setupProductEditModal() {
  const overlay = document.getElementById("editModalOverlay");
  const closeBtn = document.getElementById("closeEditModal");
  const cancelBtn = document.getElementById("cancelEditModal");
  const form = document.getElementById("editProductForm");

  if (!overlay) return;

  const closeModal = () => overlay.classList.remove("active");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("editProductId").value;
      const name = document.getElementById("editProductName").value;
      const price = parseFloat(
        document.getElementById("editProductPrice").value,
      );
      const description = document.getElementById(
        "editProductDescription",
      ).value;
      const catValue = document.getElementById("editProductCategory").value;
      const isSoldOut = document.getElementById("editProductSoldOut").checked;
      const imageInput = document.getElementById("editProductImage");
      const imageFile = imageInput.files[0];

      let category = catValue;
      let subCategory = null;
      if (catValue.includes("|")) {
        const parts = catValue.split("|");
        category = parts[0];
        subCategory = parts[1];
      }

      try {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Saving...";
        }

        const updateData = {
          name: name,
          price: price,
          description: description,
          category: category,
          subCategory: subCategory,
          soldOut: isSoldOut,
        };

        if (imageFile) {
          const reader = new FileReader();
          const base64 = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(imageFile);
          });
          updateData.imageUrl = base64;
          updateData.image = base64;
        }

        const currentProduct = window.currentProducts?.find((p) => p.id === id);
        if (currentProduct?.source === "local") {
          const ok = updateLocalProduct(id, updateData);
          if (!ok) throw new Error("Local product update failed.");
          const merged = await fetchAllProducts();
          renderProducts(merged);
        } else {
          await updateDoc(doc(db, "products", id), updateData);
        }

        closeModal();
        alert("Product updated successfully!");
      } catch (err) {
        alert("Error updating product: " + err.message);
      } finally {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Save Changes";
        }
      }
    });

    document
      .getElementById("editProductImage")
      ?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const preview = document.getElementById("editImagePreview");
            if (preview) preview.src = ev.target.result;
          };
          reader.readAsDataURL(file);
        }
      });
  }
}

// --- GLOBAL ACTIONS CONTINUED ---

window.deleteReview = async (rid) => {
  if (!confirm("Remove this review?")) return;
  try {
    await deleteDoc(doc(db, "reviews", rid));
    alert("Review removed.");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

window.contactUser = (email) => {
  alert(`Initiating secure communication with ${email}.`);
};

window.simulateMovement = async (orderId) => {
  // Simulate random movement around Lagos for testing
  const lat = 6.4 + Math.random() * 0.2;
  const lng = 3.3 + Math.random() * 0.2;

  try {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, {
      "tracking.lat": lat,
      "tracking.lng": lng,
      status: "shipped", // Auto-ship if moving
    });
    alert("Location updated! The customer's map will update live.");
  } catch (err) {
    alert("Error simulating movement: " + err.message);
  }
};

window.deleteVoucher = async (vid, forceDelete = false) => {
  if (
    !confirm(
      forceDelete ? "Permanently delete this voucher?" : "Revoke this voucher?",
    )
  )
    return;
  try {
    if (forceDelete) {
      await deleteDoc(doc(db, "vouchers", vid));
    } else {
      await updateDoc(doc(db, "vouchers", vid), { status: "expired" });
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// Form submission for voucher generation
const voucherForm = document.getElementById("generateVoucherForm");
if (voucherForm) {
  voucherForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document
      .getElementById("voucherCode")
      .value.trim()
      .toUpperCase();
    const type = document.getElementById("discountType").value;
    const value = parseFloat(document.getElementById("discountValue").value);
    const email = document
      .getElementById("assignToEmail")
      .value.trim()
      .toLowerCase();

    if (!code || value <= 0) return alert("Invalid inputs");

    try {
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Generating...";

      // Check if exists
      const existing = await getDoc(doc(db, "vouchers", code));
      if (existing.exists()) {
        alert("This voucher code already exists!");
        btn.disabled = false;
        btn.textContent = "Generate Voucher";
        return;
      }

      await setDoc(doc(db, "vouchers", code), {
        discountType: type,
        discountValue: value,
        assignedEmail: email || null,
        status: "active",
        createdAt: Date.now(),
      });

      voucherForm.reset();
      alert(`Voucher ${code} generated successfully!`);
    } catch (err) {
      alert("Error generating voucher: " + err.message);
    } finally {
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = false;
      btn.textContent = "Generate Voucher";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "login.html";
    } catch (error) {
      console.error("Admin sign out failed:", error);
      alert("Could not sign out. Please try again.");
    }
  });
}
