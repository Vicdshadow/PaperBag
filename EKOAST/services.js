// services.js
import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "./firebase-config.js";

const grids = {
  autos: document.getElementById("carGrid"),
  realestate: document.getElementById("propGrid"),
  stay: document.getElementById("stayGrid"),
};

async function loadSpecializedListings(vertical, filters = {}) {
  const grid = grids[vertical];
  if (!grid) return;

  try {
    grid.innerHTML = "<p class='loading'>Searching for the best deals...</p>";

    let q = query(
      collection(db, "specialized_listings"),
      where("vertical", "==", vertical),
      orderBy("createdAt", "desc"),
    );

    // Apply filters if any
    if (filters.make && vertical === "autos") {
      q = query(
        collection(db, "specialized_listings"),
        where("vertical", "==", vertical),
        where("meta.make", "==", filters.make),
        orderBy("createdAt", "desc"),
      );
    }

    const snap = await getDocs(q);
    grid.innerHTML = "";

    if (snap.empty) {
      grid.innerHTML = `<p class='muted' style='grid-column: 1/-1; text-align: center; padding: 40px;'>No ${vertical} listings found yet. Check back soon!</p>`;
      return;
    }

    snap.forEach((doc) => {
      const item = doc.data();
      const id = doc.id;
      const card = createCard(vertical, { id, ...item });
      grid.appendChild(card);
    });
  } catch (err) {
    console.error(`Error loading ${vertical} listings:`, err);
    grid.innerHTML = `<p class='error'>Failed to load listings. Please try again.</p>`;
  }
}

function createCard(vertical, item) {
  const div = document.createElement("div");

  if (vertical === "autos") {
    div.className = "car-card";
    div.innerHTML = `
      <img src="${item.imageUrl}" alt="${item.title}" class="car-img" onerror="this.src='assets/images/placeholder.svg'" />
      <div class="car-details">
        <h3 class="car-title">${item.title}</h3>
        <div class="car-price">₦${Number(item.price).toLocaleString()}</div>
        <div class="car-meta">
          <span><i class="fas fa-tachometer-alt"></i> ${item.meta.mileage}</span>
          <span><i class="fas fa-calendar"></i> ${item.meta.year}</span>
          <span><i class="fas fa-cog"></i> ${item.meta.transmission}</span>
        </div>
        <a href="service-detail.html?id=${item.id}" class="btn btn-outline" style="width: 100%; text-align: center; display: block;">
          View Details
        </a>
      </div>
    `;
  } else if (vertical === "realestate") {
    div.className = "prop-card";
    div.innerHTML = `
      <img src="${item.imageUrl}" alt="${item.title}" class="prop-img" onerror="this.src='assets/images/placeholder.svg'" />
      <div class="prop-details">
        <span class="prop-type">${item.meta.type}</span>
        <h3 class="prop-title">${item.title}</h3>
        <div class="prop-price">₦${Number(item.price).toLocaleString()}</div>
        <div class="prop-features">
          <span><i class="fas fa-bed"></i> ${item.meta.bedrooms} Beds</span>
          <span><i class="fas fa-bath"></i> ${item.meta.bathrooms} Baths</span>
        </div>
        <a href="service-detail.html?id=${item.id}" class="btn btn-small btn-primary" style="margin-top: 15px; width: 100%; text-align: center; display: block;">
          View Details
        </a>
      </div>
    `;
  } else if (vertical === "stay") {
    div.className = "stay-card";
    div.innerHTML = `
      <img src="${item.imageUrl}" alt="${item.title}" class="stay-img" onerror="this.src='assets/images/placeholder.svg'" />
      <div class="stay-info">
        <div style="display: flex; justify-content: space-between">
          <h3 class="stay-title">${item.title}</h3>
          <div class="stay-rating"><i class="fas fa-star"></i> New</div>
        </div>
        <p class="muted" style="margin: 0; font-size: 14px">
          ${item.meta.amenities.join(", ")}
        </p>
        <div style="margin-top: 5px; display: flex; justify-content: space-between; align-items: center;">
          <div><span class="stay-price">₦${Number(item.price).toLocaleString()}</span> ${item.meta.pricePer}</div>
          <a href="service-detail.html?id=${item.id}" class="btn btn-small btn-outline">Details</a>
        </div>
      </div>
    `;
  }

  return div;
}

// Initializing based on page
document.addEventListener("DOMContentLoaded", () => {
  if (grids.autos) {
    loadSpecializedListings("autos");

    const makeFilter = document.getElementById("makeFilter");
    if (makeFilter) {
      makeFilter.addEventListener("change", (e) => {
        loadSpecializedListings("autos", { make: e.target.value });
      });
    }
  }
  if (grids.realestate) loadSpecializedListings("realestate");
  if (grids.stay) loadSpecializedListings("stay");
});

