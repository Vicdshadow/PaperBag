// PaperBag wishlist — works for guests (localStorage) and signed-in users (Firestore).
import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  onSnapshot,
} from "./firebase-config.js";

const GUEST_KEY = "guest_wishlist";
let currentUser = null;
let items = [];
let unsubscribe = null;
let ready = false;

function readGuest() {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function writeGuest(list) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(list));
}

function normalize(p) {
  return {
    id: String(p.id || p.productId || ""),
    productId: String(p.id || p.productId || ""),
    name: p.name || p.title || "Product",
    price: Number(p.price || 0),
    image: p.image || p.imageUrl || p.imageURL || "assets/images/placeholder.svg",
    url:
      p.url ||
      (p.id ? `product.html?id=${encodeURIComponent(p.id)}` : "catalogue.html"),
    addedAt: p.addedAt || Date.now(),
  };
}

function notify() {
  updateCounts();
  renderPage();
  if (window.PaperBagWishlist && window.PaperBagWishlist._onChange) {
    window.PaperBagWishlist._onChange(items.slice());
  }
}

function isInWishlist(id) {
  return items.some((i) => String(i.id) === String(id));
}

function updateCounts() {
  const count = items.length;
  document.querySelectorAll("#wishlistCount").forEach((el) => {
    el.textContent = String(count);
    el.classList.toggle("has-items", count > 0);
  });
  document.querySelectorAll("[data-wishlist-id]").forEach((heart) => {
    const active = isInWishlist(heart.getAttribute("data-wishlist-id"));
    heart.classList.toggle("is-active", active);
    const icon = heart.querySelector("i");
    if (icon) {
      icon.classList.toggle("far", !active);
      icon.classList.toggle("fas", active);
    }
  });
  const productBtn = document.getElementById("wishlistBtn");
  if (productBtn) {
    const active = isInWishlist(
      productBtn.getAttribute("data-wishlist-id") ||
        new URLSearchParams(location.search).get("id"),
    );
    productBtn.classList.toggle("is-active", active);
    const icon = productBtn.querySelector("i");
    if (icon) {
      icon.classList.toggle("far", !active);
      icon.classList.toggle("fas", active);
    }
  }
}

function renderPage() {
  const list = document.getElementById("wishlistList");
  if (!list) return;

  if (!ready) {
    list.innerHTML =
      '<div class="empty-state" style="text-align:center;padding:60px 24px"><i class="fas fa-spinner fa-spin" style="font-size:48px;color:#c2a15a"></i></div>';
    return;
  }

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:60px 24px">
        <i class="far fa-heart" style="font-size:64px;color:#e6e6ea;margin-bottom:24px"></i>
        <h2 style="font-size:18px;margin-bottom:8px">Your wishlist is empty</h2>
        <p class="muted" style="font-size:14px">Save items you're interested in to keep track of them.</p>
        <a href="index.html" class="btn btn-small" style="margin-top:24px;display:inline-block">START SHOPPING</a>
      </div>`;
    return;
  }

  list.innerHTML = items
    .map(
      (it) => `
      <article class="wishlist-item" data-wishlist-item="${it.id}">
        <a href="${it.url}" class="wishlist-item-image">
          <img src="${it.image}" alt="${it.name}" loading="lazy" width="96" height="96" onerror="this.src='assets/images/placeholder.svg'">
        </a>
        <div class="wishlist-item-info">
          <a href="${it.url}" class="wishlist-item-title">${it.name}</a>
          <p class="wishlist-item-price">₦${Number(it.price || 0).toLocaleString()}</p>
          <div class="wishlist-item-actions">
            <a href="${it.url}" class="btn btn-small">VIEW ITEM</a>
            <button type="button" class="wishlist-remove" data-wishlist-remove="${it.id}" aria-label="Remove ${it.name} from wishlist">
              <i class="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      </article>`,
    )
    .join("");
}

async function toggle(product) {
  const p = normalize(product);
  if (!p.id) return;
  const exists = isInWishlist(p.id);

  if (currentUser) {
    const ref = doc(db, "users", currentUser.uid, "wishlist", p.id);
    try {
      if (exists) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, { ...p, addedAt: serverTimestamp() });
      }
      // onSnapshot will refresh `items`; update immediately for responsiveness.
      items = exists
        ? items.filter((i) => String(i.id) !== p.id)
        : [...items, p];
      notify();
    } catch (err) {
      console.warn("Wishlist write failed, saving locally:", err);
      const g = readGuest();
      const rest = g.filter((x) => String(x.id) !== p.id);
      writeGuest(exists ? rest : [...rest, p]);
      items = readGuest();
      notify();
    }
  } else {
    const g = readGuest();
    const rest = g.filter((x) => String(x.id) !== p.id);
    const next = exists ? rest : [...rest, p];
    writeGuest(next);
    items = next;
    notify();
  }
}

async function mergeGuestIntoAccount(user) {
  const guest = readGuest();
  if (!guest.length) return;
  const col = collection(db, "users", user.uid, "wishlist");
  try {
    for (const p of guest) {
      await setDoc(
        doc(col, p.id),
        { ...normalize(p), addedAt: serverTimestamp() },
        { merge: true },
      );
    }
    localStorage.removeItem(GUEST_KEY);
  } catch (err) {
    console.warn("Could not merge guest wishlist:", err);
  }
}

function injectHeaderHeart() {
  if (document.querySelector(".wishlist-link")) return;
  const nav =
    document.querySelector(".site-header .nav-icons") ||
    document.querySelector(".nav-icons") ||
    document.querySelector(".header-inner .header-actions");
  if (!nav) return;
  const link = document.createElement("a");
  link.href = "wishlist.html";
  link.className = "wishlist-link";
  link.setAttribute("aria-label", "Wishlist");
  link.innerHTML =
    '<i class="far fa-heart"></i><span id="wishlistCount" class="wishlist-count">0</span>';
  nav.insertBefore(link, nav.querySelector(".cart-link") || null);
}

function bindEvents() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const heart = e.target.closest("[data-wishlist-id][role='button']");
    if (!heart) return;
    e.preventDefault();
    heart.click();
  });
  document.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-wishlist-remove]");
    if (remove) {
      e.preventDefault();
      const p = items.find(
        (i) => String(i.id) === String(remove.getAttribute("data-wishlist-remove")),
      );
      if (p) toggle(p);
      return;
    }
    const heart = e.target.closest("[data-wishlist-id]");
    if (!heart) return;
    e.preventDefault();
    e.stopPropagation();
    toggle({
      id: heart.getAttribute("data-wishlist-id"),
      name: heart.getAttribute("data-wishlist-name"),
      price: heart.getAttribute("data-wishlist-price"),
      image: heart.getAttribute("data-wishlist-image"),
    });
  });
}

function init() {
  bindEvents();
  injectHeaderHeart();
  renderPage();
  onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (user) {
      await mergeGuestIntoAccount(user);
      const col = collection(db, "users", user.uid, "wishlist");
      unsubscribe = onSnapshot(
        col,
        (snap) => {
          items = snap.docs.map((d) => normalize({ id: d.id, ...d.data() }));
          ready = true;
          notify();
        },
        (err) => {
          console.warn("Wishlist listener failed:", err);
          items = readGuest();
          ready = true;
          notify();
        },
      );
    } else {
      items = readGuest();
      ready = true;
      notify();
    }
  });
}

window.PaperBagWishlist = {
  toggle,
  isInWishlist,
  getItems: () => items.slice(),
  onChange: (fn) => {
    window.PaperBagWishlist._onChange = fn;
  },
  refresh: notify,
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

export { toggle as toggleWishlist, isInWishlist as checkWishlist };
