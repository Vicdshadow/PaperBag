import {
  addLocalProduct,
  fetchLocalProducts,
  setProductSourceMode,
  PRODUCT_SOURCE,
} from "./display-products.js";
import { auth, db, onAuthStateChanged, doc, getDoc } from "./firebase-config.js";

const form = document.getElementById("localProductForm");
const list = document.getElementById("localProductsList");
const refreshBtn = document.getElementById("refreshBtn");
const ADMIN_EMAILS = [
  "support@example.com",
  "support@ekoast.com",
  "admin@ekoast.com",
  "ekoast047@gmail.com",
];

let canManageLocalProducts = false;

async function requireAdminAccess(user) {
  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  const isMasterAdmin = ADMIN_EMAILS.includes(
    String(user.email || "").trim().toLowerCase(),
  );
  if (isMasterAdmin) return true;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.data()?.role;
    return role === "admin" || role === "sub-admin";
  } catch (error) {
    console.error("Admin check failed:", error);
    return false;
  }
}

setProductSourceMode(PRODUCT_SOURCE.LOCAL);

async function renderLocalProducts() {
  if (!list) return;
  const products = await fetchLocalProducts();
  list.innerHTML = "";

  if (!products.length) {
    list.innerHTML = '<p class="muted">No local products yet.</p>';
    return;
  }

  products.forEach((product) => {
    const row = document.createElement("div");
    row.className = "admin-item";
    row.innerHTML = `
      <div>
        <div style="font-weight:700">${product.name}</div>
        <div class="muted" style="font-size:12px">${product.category || "general"} | stock: ${product.stock}</div>
      </div>
      <div style="font-weight:700">₦${Number(product.price || 0).toLocaleString()}</div>
    `;
    list.appendChild(row);
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canManageLocalProducts) {
      alert("Admin access required.");
      return;
    }
    const product = {
      name: document.getElementById("name").value.trim(),
      price: Number(document.getElementById("price").value),
      description: document.getElementById("description").value.trim(),
      category: document.getElementById("category").value.trim(),
      image: document.getElementById("image").value.trim(),
      stock: Number(document.getElementById("stock").value),
    };

    addLocalProduct(product);
    form.reset();
    await renderLocalProducts();
    alert("Local product added.");
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", renderLocalProducts);
}

onAuthStateChanged(auth, async (user) => {
  canManageLocalProducts = await requireAdminAccess(user);
  if (!canManageLocalProducts) {
    alert("Admin access only.");
    window.location.href = "index.html";
    return;
  }
  renderLocalProducts();
});
