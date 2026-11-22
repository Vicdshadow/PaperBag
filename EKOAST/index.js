// index.js
import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from "./firebase-config.js";
import {
  fetchProducts,
  getProductSourceMode,
  PRODUCT_SOURCE,
} from "./display-products.js";

const productsEl =
  document.getElementById("product-list") || document.getElementById("products");
const cartCountEl = document.getElementById("cartCount");
const searchInput = document.getElementById("searchInput");
const searchCategorySelect = document.getElementById("searchCategorySelect");
const categoryBtn = document.getElementById("navCategoryBtn");
const filtersSidebar = document.querySelector(".filters");

if (document.body) {
  document.body.classList.add("jumia-page");
}

// Toggle Sidebar Logic
if (categoryBtn && filtersSidebar) {
  categoryBtn.addEventListener("click", (e) => {
    e.preventDefault();
    filtersSidebar.classList.toggle("active");
  });
}

// Check if we should open sidebar from URL
if (new URLSearchParams(window.location.search).get("sidebar") === "true") {
  if (filtersSidebar) filtersSidebar.classList.add("active");
}

let currentUser = null;
let allProducts = [];

// ---------------- AUTH LISTENER ----------------
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateCartCount(); // Update count based on user or guest

  if (searchInput) {
    searchInput.disabled = false;
    searchInput.placeholder = "Search accessories...";
  }
});

// ---------------- CART HELPERS ----------------
async function getCartCount() {
  if (currentUser) {
    const snap = await getDocs(
      collection(db, "users", currentUser.uid, "cart"),
    );
    return snap.docs.reduce((n, d) => n + (d.data().qty || 0), 0);
  } else {
    // Guest Cart
    const guestCart = JSON.parse(localStorage.getItem("guest_cart") || "[]");
    return guestCart.reduce((n, i) => n + (i.qty || 0), 0);
  }
}

async function updateCartCount() {
  if (!cartCountEl) return;
  const count = await getCartCount();
  cartCountEl.textContent = count;
  cartCountEl.style.display = count > 0 ? "flex" : "none";
}

// ---------------- CATEGORY & FILTERING ----------------
const urlParams = new URLSearchParams(window.location.search);
const initialCat = urlParams.get("cat");
const initialSearch = urlParams.get("q"); // Handle search from URL
const sortSelect = document.getElementById("sortSelect");

const CATEGORY_NAMES = {
  electronics: "Electronics & Gadgets",
  "home-appliances": "Home Appliances",
  "car-electronics": "Car Electronics & Accessories",
  furniture: "Furniture",
  power: "Power Solutions",
  it: "IT Equipment",
  lighting: "Lighting Solutions",
  "spare-parts": "Spare Parts",
  books: "Books & Educational Materials",
  fashion: "Fashion & Accessories",
  perfume: "Perfumes & Body Care",
  bicycles: "Bicycles & Cycling Gear",
  office: "Office & Tech Equipment",
  new: "New Arrivals",
};

const CATEGORY_ALIASES = {
  electronics: "electronics",
  "electronics & gadgets": "electronics",
  phones: "electronics",
  "phones & tablets": "electronics",
  "home appliances": "home-appliances",
  appliances: "home-appliances",
  "car electronics": "car-electronics",
  furniture: "furniture",
  "home & living": "furniture",
  "home decor": "furniture",
  power: "power",
  "power solutions": "power",
  it: "it",
  "it equipment": "it",
  lighting: "lighting",
  "spare parts": "spare-parts",
  books: "books",
  fashion: "fashion",
  perfume: "perfume",
  beauty: "perfume",
  office: "office",
  bicycles: "bicycles",
  automobiles: "car-electronics",
};

function normalizeCategory(value) {
  if (!value) return "";
  const lower = String(value).trim().toLowerCase();
  return CATEGORY_ALIASES[lower] || lower.replace(/[^a-z0-9]+/g, "-");
}

const SUB_Catalogue = {
  electronics: [
    "Smartphones & Feature Phones",
    "Tablets & iPads",
    "Smartwatches & Fitness Bands",
    "Earbuds & Headphones",
    "Bluetooth Speakers",
    "Power Banks",
    "Chargers & Cables",
    "Consoles & Games",
  ],
  "home-appliances": [
    "Refrigerators & Freezers",
    "Washing Machines",
    "Microwaves & Ovens",
    "Electric Kettles",
    "Blenders & Mixers",
    "Air Conditioners & Fans",
    "Irons & Heaters",
  ],
  "car-electronics": [
    "Car Stereos & Radios",
    "GPS Navigation Systems",
    "Reverse Cameras & Sensors",
    "Car Chargers",
    "Dash Cams",
    "Seat Covers & Mats",
    "LED Car Lights",
  ],
  furniture: [
    "Office Chairs & Desks",
    "Home Sofas & Tables",
    "Wardrobes & Shelves",
    "TV Stands",
    "Beds & Mattresses",
    "Outdoor Furniture",
  ],
  power: [
    "Inverters",
    "Solar Panels",
    "Solar Batteries",
    "Power Generators",
    "UPS Systems",
    "Stabilizers",
    "Extension Boxes",
  ],
  it: [
    "Laptops & Desktops",
    "Computer Monitors",
    "Keyboards & Mouse",
    "Printers & Scanners",
    "Networking Devices (Routers, Switches)",
    "External Hard Drives & Flash Drives",
  ],
  lighting: [
    "LED Bulbs",
    "Flood Lights",
    "Street Lights",
    "Solar Lights",
    "Decorative Lights",
    "Emergency Lamps",
  ],
  "spare-parts": [
    "Phone Replacement Parts",
    "Laptop Parts (Screens, Batteries, Keyboards)",
    "Generator Spare Parts",
    "Inverter Components",
    "Car Electronic Spare Parts",
    "Power Tool Parts",
  ],
};

function filterAndRender() {
  let filtered = allProducts;
  const params = new URLSearchParams(window.location.search);
  const currentCat = params.get("cat");
  const currentSub = params.get("sub");
  const currentSearchCat = params.get("scat") || "all";
  const currentQuery =
    params.get("q") || (searchInput ? searchInput.value : "");

  // Sync Search Category Select
  if (searchCategorySelect) {
    searchCategorySelect.value = currentSearchCat;
  }

  // Determine if we are in a "filtered" state
  const isFiltering =
    (currentCat && currentCat !== "all") ||
    currentSub ||
    currentQuery ||
    (currentSearchCat && currentSearchCat !== "all");

  // Elements to toggle
  const promoCarousel = document.querySelector(".promo-carousel");
  const CatalogueSection = document.querySelector(".Catalogue-section");
  const flashSalesSection = document.querySelector(".flash-sales-section");

  // Toggle visibility
  const displayStyle = isFiltering ? "none" : "block";
  if (promoCarousel) promoCarousel.style.display = displayStyle;
  if (CatalogueSection) CatalogueSection.style.display = displayStyle;
  if (flashSalesSection) flashSalesSection.style.display = displayStyle;

  // Highlight active sidebar link
  const listLinks = document.querySelectorAll("#categoryFilterList a");
  listLinks.forEach((l) => {
    const cat = l.getAttribute("data-cat");
    const sub = l.getAttribute("data-sub");
    if (sub) {
      if (sub === currentSub) l.classList.add("active");
      else l.classList.remove("active");
    } else {
      if (cat === (currentCat || "all")) l.classList.add("active");
      else l.classList.remove("active");
    }
  });

  // Filter by Category (Sidebar or URL)
  if (currentCat && currentCat !== "all" && currentCat !== "new") {
    filtered = filtered.filter((p) => p._categoryKey === currentCat);
  }

  // Filter by Search Category (Search Bar Dropdown)
  if (currentSearchCat && currentSearchCat !== "all") {
    if (currentSearchCat.startsWith("sub:")) {
      const subName = currentSearchCat.replace("sub:", "");
      filtered = filtered.filter((p) => p.subCategory === subName);
    } else {
      filtered = filtered.filter((p) => p._categoryKey === currentSearchCat);
    }
  }

  // Filter by SubCategory
  if (currentSub) {
    filtered = filtered.filter((p) => p.subCategory === currentSub);
  }

  // Filter by Search Query
  if (currentQuery) {
    const q = currentQuery.toLowerCase();
    filtered = filtered.filter((p) => {
      const nameMatch = (p.name || "").toLowerCase().includes(q);
      const catDisplayName = (
        CATEGORY_NAMES[p._categoryKey] || ""
      ).toLowerCase();
      const catMatch = catDisplayName.includes(q);
      const subMatch = (p.subCategory || "").toLowerCase().includes(q);
      return nameMatch || catMatch || subMatch;
    });
    if (searchInput) searchInput.value = currentQuery;
  }

  // Handle "New Arrivals"
  if (currentCat === "new") {
    filtered.sort((a, b) => {
      const timeA =
        a.createdAt?.seconds ||
        (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
      const timeB =
        b.createdAt?.seconds ||
        (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
      return timeB - timeA;
    });
  }

  // Sort
  if (sortSelect) {
    const sortVal = sortSelect.value;
    if (sortVal === "price-asc") {
      filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortVal === "price-desc") {
      filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortVal === "newest") {
      filtered.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
      );
    }
  }

  const countEl = document.querySelector(".shop-count");
  const shopMainEl = document.querySelector(".shop-main"); // Ensure this class exists in HTML or add it

  // Inject/Update "Back to Catalogue" button
  let backBtn = document.getElementById("backToCatalogueBtn");
  if (isFiltering) {
    if (!backBtn && shopMainEl) {
      backBtn = document.createElement("a");
      backBtn.id = "backToCatalogueBtn";
      backBtn.href = "index.html";
      backBtn.className = "btn btn-outline";
      backBtn.textContent = "<- Back to Catalogue";
      backBtn.style.marginBottom = "20px";
      backBtn.style.display = "inline-flex"; // Ensure it's visible
      shopMainEl.insertBefore(backBtn, shopMainEl.firstChild);
    } else if (backBtn) {
      backBtn.style.display = "inline-flex";
    }
  } else {
    if (backBtn) backBtn.style.display = "none";
  }

  if (countEl) {
    let text = "Showing all products";
    if (currentQuery) {
      text = `Search results for "${currentQuery}" (${filtered.length})`;
    } else if (currentSub) {
      text = `Showing ${currentSub} (${filtered.length})`;
    } else if (currentCat && CATEGORY_NAMES[currentCat]) {
      text = `Showing ${CATEGORY_NAMES[currentCat]} (${filtered.length})`;
    } else {
      text = `Showing all products (${filtered.length})`;
    }
    countEl.textContent = text;
  }

  renderProducts(filtered);
  renderSubCategoryList(currentCat);
}

function renderSubCategoryList(cat) {
  const container = document.getElementById("subCategoryFilterList");
  if (!container) return;
  container.innerHTML = "";

  if (!cat || cat === "all" || cat === "new") return;

  const subs = SUB_Catalogue[cat] || [];
  if (subs.length === 0) return;

  const title = document.createElement("h4");
  title.className = "filter-title";
  title.style.marginTop = "20px";
  title.textContent = "Sub-sections";
  container.appendChild(title);

  const ul = document.createElement("ul");
  ul.className = "filter-list";

  subs.forEach((s) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `index.html?cat=${cat}&sub=${encodeURIComponent(s)}`;
    a.setAttribute("data-sub", s);
    a.textContent = s;

    // Check if active
    const currentSub = new URLSearchParams(window.location.search).get("sub");
    if (currentSub === s) a.className = "active";

    a.addEventListener("click", (e) => {
      e.preventDefault();
      const newUrl = new URL(window.location);
      newUrl.searchParams.set("sub", s);
      newUrl.searchParams.delete("q"); // Clear search when picking subcat
      window.history.pushState({}, "", newUrl);
      filterAndRender();
    });

    li.appendChild(a);
    ul.appendChild(li);
  });

  container.appendChild(ul);
}

// Sidebar Links
const catLinks = document.querySelectorAll("#categoryFilterList a");
catLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();

    // Update active class
    catLinks.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");

    const cat = link.getAttribute("data-cat");
    const newUrl = new URL(window.location);
    newUrl.searchParams.delete("sub");
    newUrl.searchParams.delete("q"); // Clear search when picking category

    if (cat === "all") {
      newUrl.searchParams.delete("cat");
    } else {
      newUrl.searchParams.set("cat", cat);
    }
    window.history.pushState({}, "", newUrl);
    filterAndRender();
  });
});

// Sort Listener
if (sortSelect) {
  sortSelect.addEventListener("change", filterAndRender);
}

// ---------------- PRODUCTS ----------------
async function loadProducts() {
  if (!productsEl) return;

  try {
    productsEl.innerHTML = "<p>Loading products...</p>";
    const loaded = await fetchProducts({ source: PRODUCT_SOURCE.ALL });

    allProducts = loaded.map((data) => ({
      ...data,
      _categoryKey: normalizeCategory(data.category || data.categoryLabel || ""),
    }));

    // Initial Filter
    filterAndRender();

    // Set active link based on URL
    if (initialCat) {
      const activeLink = document.querySelector(
        `#categoryFilterList a[data-cat="${initialCat}"]`,
      );
      if (activeLink) {
        catLinks.forEach((l) => l.classList.remove("active"));
        activeLink.classList.add("active");
      }
    }
  } catch (err) {
    productsEl.innerHTML = `<p class="error">Failed to load products: ${err.message}</p>`;
  }
}

function renderProducts(list) {
  productsEl.innerHTML = "";
  productsEl.classList.add("jumia-grid");

  if (list.length === 0) {
    productsEl.innerHTML = "<p>No products found.</p>";
    return;
  }

  const defaultSourceMode = getProductSourceMode();

  list.forEach((p) => {
    const div = document.createElement("div");
    div.className = "product-card jumia-card";
    const imageUrl =
      p.imageUrl ||
      p.imageURL ||
      p.image ||
      "assets/images/placeholder.svg";
    const isSoldOut = p.soldOut === true;
    const categoryLabel =
      CATEGORY_NAMES[p._categoryKey] || p.category || p.categoryLabel || "";
    const rawName =
      [
        p.name,
        p.title,
        p.productName,
        p.productTitle,
        p.label,
        p.itemName,
      ]
        .map((v) => String(v || "").trim())
        .find((v) => v.length > 0) || "Unnamed product";
    const name = escapeHtml(rawName);
    const currentPrice = Number(p.price || 0);
    const hasComparePrice = Number(p.comparePrice || 0) > currentPrice;
    const oldPrice = hasComparePrice
      ? Number(p.comparePrice)
      : Math.round(currentPrice * 1.12);
    const discountPercent =
      oldPrice > currentPrice
        ? Math.max(1, Math.round(((oldPrice - currentPrice) / oldPrice) * 100))
        : 0;
    const rating =
      Number(p.rating || p.avgRating || 4.5) > 5
        ? 5
        : Number(p.rating || p.avgRating || 4.5);
    const reviewCount = Number(
      p.reviewCount || Math.floor(Math.random() * 1200) + 18,
    );
    const reviewLabel = reviewCount > 0 ? `(${reviewCount})` : "";

    div.innerHTML = `
      <a href="product.html?id=${encodeURIComponent(p.id)}&source=${encodeURIComponent(p.source || defaultSourceMode)}" class="product-image jumia-product-image ${isSoldOut ? "opacity-60" : ""}">
        <img src="${imageUrl}" alt="${name}" onerror="this.src='assets/images/placeholder.svg'">
        <span class="jumia-badge">Tech week deal</span>
        ${discountPercent > 0 ? `<span class="jumia-discount">-${discountPercent}%</span>` : ""}
        <span class="jumia-wishlist"><i class="far fa-heart"></i></span>
      </a>
      <div class="product-info jumia-product-info">
        <div class="jumia-store">Official Store</div>
        <h3 class="product-title jumia-title" style="${isSoldOut ? "text-decoration: line-through;" : ""}">${name}</h3>
        <p class="product-price jumia-price">₦ ${currentPrice.toLocaleString()}</p>
        ${oldPrice > currentPrice ? `<p class="jumia-old-price">₦ ${oldPrice.toLocaleString()}</p>` : ""}
        <div class="jumia-rating">${renderStars(rating)} <span>${reviewLabel}</span></div>
        <div class="jumia-express">EKOAST EXPRESS</div>
        <button
          class="btn btn-small add-cart-btn jumia-add-btn"
          data-id="${String(p.id)}"
          data-name="${escapeHtml(rawName)}"
          data-price="${Number(p.price || 0)}"
          data-image="${String(imageUrl).replace(/"/g, "&quot;")}"
          ${isSoldOut ? "disabled" : ""}
          style="${isSoldOut ? "background:#72727b;border-color:#72727b;cursor:not-allowed;" : ""}"
        >
          ${isSoldOut ? "Out Of Stock" : "Add To Cart"}
        </button>
      </div>
    `;
    productsEl.appendChild(div);

    const addBtn = div.querySelector(".add-cart-btn");
    if (addBtn && !isSoldOut) {
      addBtn.addEventListener("click", async () => {
        addBtn.disabled = true;
        const originalText = addBtn.textContent;
        addBtn.textContent = "Adding...";
        try {
          await addItemToCart({
            id: p.id,
            name: p.name,
            price: Number(p.price || 0),
            image: imageUrl,
          });
          addBtn.textContent = "Added";
          updateCartCount();
        } catch (error) {
          console.error("Add to cart failed:", error);
          alert("Could not add item to cart.");
          addBtn.textContent = originalText;
        } finally {
          setTimeout(() => {
            addBtn.disabled = false;
            addBtn.textContent = originalText;
          }, 900);
        }
      });
    }
  });
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const empty = Math.max(0, 5 - full);
  return `${"★".repeat(full)}${"☆".repeat(empty)}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function addItemToCart(product) {
  if (currentUser) {
    const ref = doc(db, "users", currentUser.uid, "cart", String(product.id));
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { qty: (snap.data().qty || 0) + 1 });
    } else {
      await setDoc(ref, {
        name: product.name,
        price: Number(product.price || 0),
        image: product.image || "",
        qty: 1,
      });
    }
    return;
  }

  const guestCart = JSON.parse(localStorage.getItem("guest_cart") || "[]");
  const existing = guestCart.find((item) => String(item.id) === String(product.id));
  if (existing) {
    existing.qty += 1;
  } else {
    guestCart.push({
      id: String(product.id),
      name: product.name,
      price: Number(product.price || 0),
      image: product.image || "",
      qty: 1,
    });
  }
  localStorage.setItem("guest_cart", JSON.stringify(guestCart));
}

// ---------------- SEARCH ----------------
if (searchInput) {
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      const scat = searchCategorySelect ? searchCategorySelect.value : "all";
      if (window.location.pathname.includes("index.html")) {
        const newUrl = new URL(window.location);
        if (q) newUrl.searchParams.set("q", q);
        else newUrl.searchParams.delete("q");

        if (scat && scat !== "all") newUrl.searchParams.set("scat", scat);
        else newUrl.searchParams.delete("scat");

        // When searching, we might want to override the sidebar category if search category is explicit
        if (scat !== "all") newUrl.searchParams.delete("cat");
        newUrl.searchParams.delete("sub");

        window.history.pushState({}, "", newUrl);
        filterAndRender();
      } else {
        let url = `index.html?q=${encodeURIComponent(q)}`;
        if (scat && scat !== "all") url += `&scat=${scat}`;
        window.location.href = url;
      }
    }
  });

  // Keep live filtering on shop page
  searchInput.addEventListener("input", (e) => {
    const container = document.getElementById("searchContainer");
    if (container) {
      if (e.target.value.trim() !== "") {
        container.classList.add("has-text");
      } else {
        container.classList.remove("has-text");
      }
    }

    if (window.location.pathname.includes("index.html")) {
      filterAndRender();
    }
  });

  // Clear Search Functionality
  const clearBtn = document.getElementById("clearSearch");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      const container = document.getElementById("searchContainer");
      if (container) container.classList.remove("has-text");
      searchInput.focus();

      if (window.location.pathname.includes("index.html")) {
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete("q");
        window.history.pushState({}, "", newUrl);
        filterAndRender();
      }
    });
  }
}

if (searchCategorySelect) {
  // Populate with sub-Catalogue as well
  const optGroup = searchCategorySelect.querySelector(
    'optgroup[label="Catalogue"]',
  );
  if (optGroup) {
    Object.keys(SUB_Catalogue).forEach((catKey) => {
      const subs = SUB_Catalogue[catKey];
      subs.forEach((sub) => {
        const option = document.createElement("option");
        option.value = `sub:${sub}`; // Prefix to distinguish subCatalogue
        option.textContent = `— ${sub}`;
        optGroup.appendChild(option);
      });
    });
  }

  searchCategorySelect.addEventListener("change", (e) => {
    if (window.location.pathname.includes("index.html")) {
      const scat = e.target.value;
      const newUrl = new URL(window.location);
      if (scat && scat !== "all") newUrl.searchParams.set("scat", scat);
      else newUrl.searchParams.delete("scat");

      // If we pick a search category, clear sidebar cat and sub to avoid confusion
      if (scat !== "all") {
        newUrl.searchParams.delete("cat");
        newUrl.searchParams.delete("sub");
      }

      window.history.pushState({}, "", newUrl);
      filterAndRender();
    }
  });
}

// ---------------- INIT ----------------
loadProducts();

// ---------------- NEWSLETTER SUBSCRIPTION (for index.html) ----------------
const indexNewsletterSubmit = document.getElementById("indexNewsletterSubmit");
const indexNewsletterEmail = document.getElementById("indexNewsletterEmail");

if (indexNewsletterSubmit && indexNewsletterEmail) {
  indexNewsletterSubmit.addEventListener("click", () => {
    const email = indexNewsletterEmail.value.trim();

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      alert("Please enter your email address.");
      return;
    }

    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    // Store subscription in localStorage
    try {
      const subscribers = JSON.parse(
        localStorage.getItem("newsletterSubscribers") || "[]",
      );

      if (subscribers.includes(email)) {
        alert("You're already subscribed to our newsletter!");
        indexNewsletterEmail.value = "";
        return;
      }

      subscribers.push(email);
      localStorage.setItem(
        "newsletterSubscribers",
        JSON.stringify(subscribers),
      );

      alert(
        "Thank you for subscribing! You'll receive exclusive updates from us.",
      );
      indexNewsletterEmail.value = "";
    } catch (error) {
      console.error("Error saving subscription:", error);
      alert("Subscription successful! Thank you for joining our newsletter.");
      indexNewsletterEmail.value = "";
    }
  });

  // Allow Enter key to submit
  indexNewsletterEmail.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      indexNewsletterSubmit.click();
    }
  });
}

// ============== JUMIA-STYLE FEATURES ==============

// ---------------- PROMOTIONAL BANNER CAROUSEL ----------------
const carouselSlides = document.getElementById("carouselSlides");
const carouselDots = document.getElementById("carouselDots");

if (carouselSlides && carouselDots) {
  let currentSlide = 0;
  const slides = carouselSlides.children;
  const dots = carouselDots.children;
  let autoRotateInterval;

  function showSlide(index) {
    if (!carouselSlides) return;
    carouselSlides.style.transform = `translateX(-${index * 100}%)`;

    // Update dots
    Array.from(dots).forEach((dot, i) => {
      if (i === index) {
        dot.classList.add("active", "bg-white");
        dot.classList.remove("bg-white/50");
      } else {
        dot.classList.remove("active", "bg-white");
        dot.classList.add("bg-white/50");
      }
    });
    currentSlide = index;
  }

  function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
  }

  function startAutoRotate() {
    autoRotateInterval = setInterval(nextSlide, 5000); // Rotate every 5 seconds
  }

  function stopAutoRotate() {
    clearInterval(autoRotateInterval);
  }

  // Dot navigation
  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      stopAutoRotate();
      showSlide(index);
      startAutoRotate(); // Restart auto-rotation after manual navigation
    });
  });

  // Pause on hover
  carouselSlides.addEventListener("mouseenter", stopAutoRotate);
  carouselSlides.addEventListener("mouseleave", startAutoRotate);

  // Initialize
  showSlide(0);
  startAutoRotate();
}

// ---------------- COUNTDOWN TIMER ----------------
const countdownTimer = document.getElementById("countdownTimer");

if (countdownTimer) {
  const hoursEl = document.getElementById("hours");
  const minutesEl = document.getElementById("minutes");
  const secondsEl = document.getElementById("seconds");

  function updateCountdown() {
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const diff = endOfDay - now;

    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hoursEl) hoursEl.textContent = String(hours).padStart(2, "0");
      if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, "0");
      if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, "0");
    } else {
      // Reset at midnight
      if (hoursEl) hoursEl.textContent = "00";
      if (minutesEl) minutesEl.textContent = "00";
      if (secondsEl) secondsEl.textContent = "00";
    }
  }

  // Update every second
  updateCountdown();
  setInterval(updateCountdown, 1000);
}

// ---------------- FLASH PRODUCTS ----------------
const flashProductsContainer = document.getElementById("flashProducts");

async function loadFlashProducts() {
  if (!flashProductsContainer) return;

  try {
    // Get products from allProducts array (already loaded)
    if (allProducts.length === 0) {
      // Wait a bit for products to load
      setTimeout(loadFlashProducts, 500);
      return;
    }

    // Select random products for flash sale (or filter by a flash sale flag if you have one)
    const flashProducts = allProducts
      .filter((p) => p.price > 0) // Only products with prices
      .slice(0, 10); // Take first 10 products

    if (flashProducts.length === 0) {
      flashProductsContainer.innerHTML =
        '<p style="padding: 20px;">No flash sale products available.</p>';
      return;
    }

    flashProductsContainer.innerHTML = "";

    flashProducts.forEach((product, index) => {
      // Calculate random discount between 5% and 30%
      const discountPercent = Math.floor(Math.random() * 26) + 5;
      const originalPrice = product.price;
      const discountedPrice = Math.floor(
        originalPrice * (1 - discountPercent / 100),
      );

      // Random stock between 10 and 100
      const stock = Math.floor(Math.random() * 91) + 10;
      const stockPercent = Math.min((stock / 100) * 100, 100);

      // Random free gift badge (20% chance)
      const hasFreeGift = Math.random() < 0.2;

      const card = document.createElement("div");
      card.className =
        "min-w-[160px] md:min-w-[180px] group flex flex-col gap-2 rounded-xl bg-white p-3 border border-gray-100 shadow-sm hover:shadow-md transition-all";

      const imageUrl =
        product.image || "assets/images/placeholder.svg";

      card.innerHTML = `
        <a href="product.html?id=${product.id}" class="flex flex-col h-full relative">
          ${
            hasFreeGift
              ? '<div class="absolute top-1 left-1 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded z-10">🎁 Gift</div>'
              : `<div class="absolute top-1 left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-10">-${discountPercent}%</div>`
          }
          <div class="aspect-square rounded-lg overflow-hidden bg-gray-100 mb-2">
            <img src="${imageUrl}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onerror="this.src='assets/images/placeholder.svg'">
          </div>
          <div class="flex flex-col flex-grow">
            <h4 class="text-[12px] font-medium text-eko-secondary line-clamp-1 mb-1">${product.name}</h4>
            <p class="text-[13px] font-bold text-eko-secondary">₦${discountedPrice.toLocaleString()}</p>
            <p class="text-[10px] text-gray-400 line-through">₦${originalPrice.toLocaleString()}</p>
          </div>
        </a>
      `;

      flashProductsContainer.appendChild(card);
    });
  } catch (error) {
    console.error("Error loading flash products:", error);
    flashProductsContainer.innerHTML =
      '<p style="padding: 20px;">Failed to load flash sale products.</p>';
  }
}

// Load flash products after main products are loaded
if (flashProductsContainer) {
  // Wait for allProducts to be populated
  const checkProducts = setInterval(() => {
    if (allProducts.length > 0) {
      loadFlashProducts();
      clearInterval(checkProducts);
    }
  }, 100);
}
