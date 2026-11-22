/**
 * seller-wallet.js — Seller Wallet Management
 *
 * Logic:
 * 1. Fetch orders where sellerId == currentUser.uid
 * 2. Calculate Pending (status == 'verified' or 'shipped')
 * 3. Calculate Available (delivered orders not yet paid out)
 * 4. Handle bank detail updates and payout requests
 */

import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  addDoc,
} from "./firebase-config.js";

const loadingOverlay = document.getElementById("loading");
const walletContent = document.getElementById("wallet-content");
const pendingPayoutEl = document.getElementById("pendingPayout");
const availableBalanceEl = document.getElementById("availableBalance");
const payoutForm = document.getElementById("payoutForm");
const requestBtn = document.getElementById("requestPayoutBtn");
const payoutStatusEl = document.getElementById("payoutStatus");

let currentUser = null;
let currentAvailable = 0;
let eligibleOrderIds = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === "seller") {
      const userData = userDoc.data();
      // Pre-fill bank details if they exist
      if (userData.payoutDetails) {
        document.getElementById("bankName").value =
          userData.payoutDetails.bankName || "";
        document.getElementById("accountNumber").value =
          userData.payoutDetails.accountNumber || "";
        document.getElementById("accountName").value =
          userData.payoutDetails.accountName || "";
      }

      loadingOverlay.classList.add("hidden");
      walletContent.classList.remove("hidden");

      listenToEarnings(user.uid);
      listenToPayoutHistory(user.uid);
    } else {
      window.location.href = "index.html";
    }
  } catch (err) {
    console.error("Wallet Error:", err);
  }
});

function listenToEarnings(sellerId) {
  const q = query(collection(db, "orders"), where("sellerId", "==", sellerId));

  onSnapshot(q, (snap) => {
    let pending = 0;
    let available = 0;
    const payoutIds = [];

    snap.forEach((d) => {
      const o = d.data();
      const status = (o.status || "").toLowerCase();
      const paymentStatus = (o.paymentStatus || "").toLowerCase();
      const amount = Number(o.amount ?? o.totalAmount ?? 0);
      if (!amount) return;
      if (o.payoutRequestedAt || o.paidOutAt) return;

      const isPending =
        paymentStatus === "processing" ||
        paymentStatus === "pending" ||
        (!paymentStatus &&
          ["pending", "ready", "shipped", "verified"].includes(status));
      const isAvailable =
        paymentStatus === "available" ||
        ["delivered", "completed"].includes(status);

      if (isPending) {
        pending += amount;
      } else if (isAvailable) {
        available += amount;
        payoutIds.push(d.id);
      }
    });

    eligibleOrderIds = payoutIds;
    currentAvailable = available;
    pendingPayoutEl.textContent = `₦${pending.toLocaleString()}`;
    availableBalanceEl.textContent = `₦${available.toLocaleString()}`;

    requestBtn.disabled = available < 1000;
    requestBtn.title = available < 1000 ? "Minimum payout is ₦1,000" : "";
  });
}
function listenToPayoutHistory(sellerId) {
  const q = query(collection(db, "payouts"), where("sellerId", "==", sellerId));

  const historyEl = document.getElementById("payoutHistory");

  onSnapshot(q, (snap) => {
    if (snap.empty) return;

    historyEl.innerHTML = "";
    snap.forEach((d) => {
      const p = d.data();
      const div = document.createElement("div");
      div.className = "history-item";
      const dateStr = p.createdAt
        ? new Date(p.createdAt.seconds * 1000).toLocaleDateString()
        : "Just now";

      div.innerHTML = `
                <div class="history-info">
                    <div style="font-weight:700;">₦${p.amount.toLocaleString()}</div>
                    <div class="muted">${dateStr}</div>
                </div>
                <span class="history-status status-${p.status || "pending"}">${p.status || "pending"}</span>
            `;
      historyEl.appendChild(div);
    });
  });
}

payoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (currentAvailable < 1000) return;

  const details = {
    bankName: document.getElementById("bankName").value.trim(),
    accountNumber: document.getElementById("accountNumber").value.trim(),
    accountName: document.getElementById("accountName").value.trim(),
  };

  requestBtn.disabled = true;
  requestBtn.textContent = "Processing...";
  payoutStatusEl.textContent = "";

  try {
    // 1. Save/Update bank details in user profile
    await updateDoc(doc(db, "users", currentUser.uid), {
      payoutDetails: details,
    });

    // 2. Create Payout Request
    await addDoc(collection(db, "payouts"), {
      sellerId: currentUser.uid,
      sellerEmail: currentUser.email,
      amount: currentAvailable,
      orderIds: eligibleOrderIds,
      details: details,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    // 3. Mark currently eligible orders so the same funds cannot be requested twice.
    if (eligibleOrderIds.length > 0) {
      await Promise.all(
        eligibleOrderIds.map((id) =>
          updateDoc(doc(db, "orders", id), {
            paymentStatus: "paid_out",
            payoutRequestedAt: serverTimestamp(),
          }),
        ),
      );
    }

    payoutStatusEl.style.color = "green";
    payoutStatusEl.textContent =
      "✅ Payout request submitted! Funds will reach your account soon.";

    // Form reset logic optionally
  } catch (err) {
    console.error("Payout submission error:", err);
    payoutStatusEl.style.color = "red";
    payoutStatusEl.textContent = "❌ Error: " + err.message;
    requestBtn.disabled = false;
  } finally {
    requestBtn.textContent = "Request Payout";
  }
});

