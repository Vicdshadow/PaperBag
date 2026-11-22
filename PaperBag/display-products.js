import { db, collection, getDocs, query, orderBy } from "./firebase-config.js";

const LOCAL_PRODUCTS_FILE = "./products.json";
const LOCAL_PRODUCTS_KEY = "paperbag_local_products";
const SOURCE_KEY = "paperbag_product_source";

export const PRODUCT_SOURCE = {
  LOCAL: "local",
  FIREBASE: "firebase",
  ALL: "all",
};

export function getProductSourceMode() {
  const mode = localStorage.getItem(SOURCE_KEY);
  if (mode === PRODUCT_SOURCE.FIREBASE) return PRODUCT_SOURCE.FIREBASE;
  return PRODUCT_SOURCE.LOCAL;
}

export function setProductSourceMode(mode) {
  const safeMode =
    mode === PRODUCT_SOURCE.FIREBASE
      ? PRODUCT_SOURCE.FIREBASE
      : PRODUCT_SOURCE.LOCAL;
  localStorage.setItem(SOURCE_KEY, safeMode);
}

function normalizeProduct(product, index = 0) {
  const safeId = String(product.id || `local-${Date.now()}-${index}`);
  const price = Number(product.price || 0);
  const stock = Number(product.stock ?? 0);
  const inferred = inferClassification(product);
  const baseCategory = normalizeCategoryKey(product.category || "");
  const shouldOverrideCategory = !baseCategory || inferred.confidence >= 2;
  const finalCategory = shouldOverrideCategory
    ? inferred.category || baseCategory
    : baseCategory;
  const finalSubCategory =
    inferred.subCategory || product.subCategory || product.sub_category || "";

  return {
    ...product,
    id: safeId,
    name:
      product.name ||
      product.title ||
      product.productName ||
      product.productTitle ||
      "Untitled Product",
    description: product.description || "",
    category: finalCategory || product.category || "",
    subCategory: finalSubCategory,
    image: product.image || product.imageUrl || product.imageURL || "",
    imageUrl: product.imageUrl || product.image || "",
    price,
    stock,
    soldOut: stock === 0 || product.soldOut === true,
    createdAt:
      product.createdAt ||
      product.created_at ||
      new Date(Date.now() - index * 1000).toISOString(),
    source: product.source || PRODUCT_SOURCE.LOCAL,
  };
}

function normalizeCategoryKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const alias = {
    electronics: "electronics",
    phones: "electronics",
    "phones & tablets": "electronics",
    "home appliances": "home-appliances",
    appliances: "home-appliances",
    furniture: "furniture",
    power: "power",
    lighting: "lighting",
    books: "books",
    fashion: "fashion",
    perfume: "perfume",
    office: "office",
    bicycles: "bicycles",
    "car electronics": "car-electronics",
    "spare parts": "spare-parts",
    it: "it",
  };
  if (!raw) return "";
  return alias[raw] || raw.replace(/[^a-z0-9]+/g, "-");
}

function inferClassification(product) {
  const text = [
    product.name,
    product.title,
    product.productName,
    product.description,
    product.subCategory,
    product.category,
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");

  const rules = [
    {
      re: /\b(phone|smartphone|iphone|android|redmi|samsung|tecno|infinix)\b/,
      category: "electronics",
      subCategory: "Smartphones & Feature Phones",
      confidence: 3,
    },
    {
      re: /\b(tablet|ipad)\b/,
      category: "electronics",
      subCategory: "Tablets & iPads",
      confidence: 3,
    },
    {
      re: /\b(earbud|earpods|headphone|headset)\b/,
      category: "electronics",
      subCategory: "Earbuds & Headphones",
      confidence: 2,
    },
    {
      re: /\b(bluetooth speaker|speaker|soundbar)\b/,
      category: "electronics",
      subCategory: "Bluetooth Speakers",
      confidence: 2,
    },
    {
      re: /\b(power bank|charger|cable)\b/,
      category: "electronics",
      subCategory: "Chargers & Cables",
      confidence: 2,
    },
  ];

  for (const rule of rules) {
    if (rule.re.test(text)) {
      return rule;
    }
  }

  return { category: "", subCategory: "", confidence: 0 };
}

export async function fetchLocalProducts() {
  let fileProducts = [];
  try {
    const res = await fetch(LOCAL_PRODUCTS_FILE, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${LOCAL_PRODUCTS_FILE}`);
    fileProducts = await res.json();
  } catch (error) {
    console.warn("Could not load local products file:", error);
  }

  let storedProducts = [];
  try {
    storedProducts = JSON.parse(
      localStorage.getItem(LOCAL_PRODUCTS_KEY) || "[]",
    );
  } catch (error) {
    console.warn("Could not read local stored products:", error);
  }

  // Prioritize storedProducts (overrides) over fileProducts
  const map = new Map();
  fileProducts.forEach((p) => map.set(String(p.id), p));
  storedProducts.forEach((p) => map.set(String(p.id), p));

  return Array.from(map.values()).map((product, index) =>
    normalizeProduct({ ...product, source: PRODUCT_SOURCE.LOCAL }, index),
  );
}

export async function fetchFirebaseProducts() {
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  const products = [];
  snap.forEach((docSnap, index) => {
    products.push(
      normalizeProduct(
        {
          id: docSnap.id,
          ...docSnap.data(),
          source: PRODUCT_SOURCE.FIREBASE,
        },
        index,
      ),
    );
  });
  return products;
}

export async function fetchProducts(options = {}) {
  const mode = options.source || getProductSourceMode();
  if (mode === PRODUCT_SOURCE.ALL) {
    return fetchAllProducts();
  }
  if (mode === PRODUCT_SOURCE.FIREBASE) {
    return fetchFirebaseProducts();
  }
  return fetchLocalProducts();
}

export async function fetchAllProducts() {
  const [localProducts, firebaseProducts] = await Promise.all([
    fetchLocalProducts().catch(() => []),
    fetchFirebaseProducts().catch((error) => {
      console.warn(
        "Could not load Firebase products, using local only.",
        error,
      );
      return [];
    }),
  ]);

  const map = new Map();
  [...firebaseProducts, ...localProducts].forEach((product) => {
    map.set(String(product.id), product);
  });
  return Array.from(map.values());
}

export async function getProductById(id, options = {}) {
  const products = await fetchProducts(options);
  return products.find((product) => String(product.id) === String(id)) || null;
}

export function addLocalProduct(productInput) {
  const existing = JSON.parse(localStorage.getItem(LOCAL_PRODUCTS_KEY) || "[]");
  const id = productInput.id || `p-${Date.now()}`;

  // If product already exists in localStorage, update it. Otherwise, add new.
  const idx = existing.findIndex((p) => String(p.id) === String(id));
  const normalized = normalizeProduct({
    ...productInput,
    id,
    source: PRODUCT_SOURCE.LOCAL,
  });

  if (idx > -1) {
    existing[idx] = normalized;
  } else {
    existing.push(normalized);
  }

  localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(existing));
  return id;
}

export function getLocalStoredProducts() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PRODUCTS_KEY) || "[]");
  } catch (error) {
    console.warn("Could not parse local products store:", error);
    return [];
  }
}

export function updateLocalProduct(id, patch) {
  const items = getLocalStoredProducts();
  const idx = items.findIndex((item) => String(item.id) === String(id));
  if (idx === -1) return false;
  items[idx] = { ...items[idx], ...patch };
  localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(items));
  return true;
}

export function deleteLocalProduct(id) {
  const items = getLocalStoredProducts();
  const next = items.filter((item) => String(item.id) !== String(id));
  if (next.length === items.length) return false;
  localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(next));
  return true;
}
