const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ekoast-default-rtdb.firebaseio.com",
  storageBucket: `${serviceAccount.project_id}.appspot.com`,
});

const db = admin.firestore();

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

const CATEGORY_LABELS = {
  electronics: "Electronics",
  "home-appliances": "Home Appliances",
  "car-electronics": "Car Electronics",
  furniture: "Furniture",
  power: "Power",
  it: "IT Equipment",
  lighting: "Lighting",
  "spare-parts": "Spare Parts",
  books: "Books",
  fashion: "Fashion",
  perfume: "Perfume",
  bicycles: "Bicycles",
  office: "Office",
};

function normalizeCategory(value) {
  if (!value) return "other";
  const lower = String(value).trim().toLowerCase();
  return CATEGORY_ALIASES[lower] || lower.replace(/[^a-z0-9]+/g, "-");
}

async function run() {
  const snap = await db.collection("products").get();
  const batch = db.batch();
  let updated = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const rawCategory = data.category || data.categoryLabel || "";
    const normalized = normalizeCategory(rawCategory);

    const categoryLabel =
      data.categoryLabel ||
      (CATEGORY_LABELS[normalized] || data.category || rawCategory || "");

    if (data.category !== normalized || data.categoryLabel !== categoryLabel) {
      batch.update(docSnap.ref, {
        category: normalized,
        categoryLabel: categoryLabel,
      });
      updated += 1;
    }
  });

  if (updated === 0) {
    console.log("No products needed backfill.");
    return;
  }

  await batch.commit();
  console.log(`Backfill complete. Updated ${updated} products.`);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

