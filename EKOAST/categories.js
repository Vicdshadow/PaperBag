import { fetchAllProducts } from "./display-products.js";

const CATEGORY_LIST = [
  { key: "electronics", label: "Electronics & Gadgets" },
  { key: "home-appliances", label: "Home Appliances" },
  { key: "fashion", label: "Fashion & Accessories" },
  { key: "perfume", label: "Perfumes & Body Care" },
  { key: "furniture", label: "Furniture & Home" },
  { key: "office", label: "Office & Tech Equipment" },
  { key: "it", label: "IT Equipment" },
  { key: "lighting", label: "Lighting Solutions" },
  { key: "power", label: "Power Solutions" },
  { key: "car-electronics", label: "Car Electronics & Accessories" },
  { key: "spare-parts", label: "Spare Parts" },
  { key: "books", label: "Books & Educational Materials" },
  { key: "bicycles", label: "Bicycles & Cycling Gear" },
];

const CATEGORY_ALIASES = {
  electronics: "electronics",
  "electronics & gadgets": "electronics",
  phones: "electronics",
  "phones & tablets": "electronics",
  "home appliances": "home-appliances",
  appliances: "home-appliances",
  "home & living": "furniture",
  "car electronics": "car-electronics",
  furniture: "furniture",
  "home decor": "furniture",
  power: "power",
  "power solutions": "power",
  it: "it",
  "it equipment": "it",
  office: "office",
  lighting: "lighting",
  "spare parts": "spare-parts",
  books: "books",
  fashion: "fashion",
  perfume: "perfume",
  beauty: "perfume",
  automobiles: "car-electronics",
  "office & tech equipment": "office",
  office: "office",
  bicycles: "bicycles",
};

const navListEl = document.getElementById("categoryNavList");
const sectionsEl = document.getElementById("categorySections");

function normalizeCategory(value) {
  if (!value) return null;
  const lower = String(value).trim().toLowerCase();
  return CATEGORY_ALIASES[lower] || lower.replace(/\s+/g, "-");
}

function formatPrice(value) {
  const num = Number(value || 0);
  return `\u20A6${num.toLocaleString()}`;
}

function renderNav(counts) {
  if (!navListEl) return;
  navListEl.innerHTML = "";

  CATEGORY_LIST.forEach((cat) => {
    const li = document.createElement("li");
    const count = counts[cat.key] || 0;
    li.innerHTML = `
      <a href="#cat-${cat.key}" class="category-nav-link">
        <span>${cat.label}</span>
        <span class="category-count">${count}</span>
      </a>
    `;
    navListEl.appendChild(li);
  });
}

function renderSections(grouped) {
  if (!sectionsEl) return;
  sectionsEl.innerHTML = "";

  let renderedCount = 0;
  CATEGORY_LIST.forEach((cat) => {
    const items = grouped[cat.key] || [];
    if (items.length === 0) return;
    renderedCount += 1;

    const section = document.createElement("section");
    section.className = "category-section";
    section.id = `cat-${cat.key}`;

    const productsHtml = items.slice(0, 6).map((p) => {
      const img = p.imageUrl || p.imageURL || p.image || "";
      const soldOut = p.soldOut === true;
      const badge = soldOut
        ? `<span class="category-product-badge sold-out">Sold out</span>`
        : p.subCategory
          ? `<span class="category-product-badge">${p.subCategory}</span>`
          : "";
      const linkAttrs = soldOut
        ? 'tabindex="-1" aria-disabled="true"'
        : "";
      const linkStyle = soldOut ? "pointer-events:none; opacity:0.6;" : "";
      return `
        <a href="product.html?id=${p.id}" class="category-product-card" style="${linkStyle}" ${linkAttrs}>
          <div class="category-product-image">
            <img src="${img}" alt="${p.name || "Product"}" onerror="this.src='https://via.placeholder.com/300x300?text=No+Image'">
            ${badge}
          </div>
          <div class="category-product-info">
            <div class="category-product-title">${p.name || "Unnamed product"}</div>
            <div class="category-product-price">${formatPrice(p.price)}</div>
          </div>
        </a>
      `;
    });

    section.innerHTML = `
      <div class="category-section-header">
        <div>
          <h2>${cat.label}</h2>
          <p>${items.length} items available</p>
        </div>
        <a class="category-see-all" href="index.html?cat=${cat.key}">
          See All
        </a>
      </div>
      <div class="category-products-grid">
        ${productsHtml.join("")}
      </div>
    `;

    sectionsEl.appendChild(section);
  });

  if (renderedCount === 0) {
    sectionsEl.innerHTML = `
      <div class="category-empty">
        <h3>No products available yet.</h3>
        <p>Upload products in Admin > Upload Product to populate categories.</p>
      </div>
    `;
  }
}

async function loadCategories() {
  if (!sectionsEl) return;
  sectionsEl.innerHTML = `
    <div class="category-loading">
      <span class="spinner"></span>
      Loading categories...
    </div>
  `;

  try {
    const products = await fetchAllProducts();
    const grouped = {};
    const counts = {};

    products.forEach((data) => {
      const normalized = normalizeCategory(
        data.category || data.categoryLabel || "",
      );
      if (!normalized) return;

      if (!grouped[normalized]) grouped[normalized] = [];
      grouped[normalized].push(data);

      counts[normalized] = (counts[normalized] || 0) + 1;
    });

    renderNav(counts);
    renderSections(grouped);
  } catch (err) {
    console.error("Failed to load categories:", err);
    sectionsEl.innerHTML = `
      <div class="category-empty">
        <h3>Unable to load categories.</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

loadCategories();

