import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  signOut,
  ADMIN_EMAILS,
  isAdminEmail,
} from "./firebase-config.js";

const loginLink = document.getElementById("loginLink");
const signupLink = document.getElementById("signupLink");
const logoutBtn = document.getElementById("logoutBtn");
const userNameDisplay = document.getElementById("userName");

onAuthStateChanged(auth, async (user) => {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const isAdminPage = currentPage.startsWith("admin");

  // NOT LOGGED IN
  if (!user) {
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userNameDisplay) userNameDisplay.textContent = "";
    return;
  }

  if (logoutBtn) {
    logoutBtn.style.display = "block";
    logoutBtn.onclick = async () => {
      await signOut(auth);
      window.location.href = "login.html";
    };
  }

  // GET USER DATA & CLAIMS
  let snap = { exists: () => false };
  let idTokenResult = { claims: {} };
  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  const isMasterAdmin = isAdminEmail(email);

  // Never apply buyer-page redirects to a whitelisted admin.
  if (isMasterAdmin) {
    if (typeof finalizeAdminUi === "function") finalizeAdminUi();
    if (isAdminPage) return;
    // We don't strictly need to await Firestore for Master Admins on non-admin pages
  }

  try {
    // If we're whitelisted, we can proceed with minimal UI updates even if this fails
    const results = await Promise.allSettled([
      getDoc(doc(db, "users", user.uid)),
      user.getIdTokenResult(),
    ]);

    if (results[0].status === "fulfilled") snap = results[0].value;
    if (results[1].status === "fulfilled") idTokenResult = results[1].value;
  } catch (error) {
    console.error("Failed to load user profile or claims:", error);
    if (isAdminPage) return;
  }

  if (!snap.exists()) {
    if (isAdminPage) return;
    return;
  }

  const data = snap.data();
  const claimRole = String(idTokenResult.claims.role || "").toLowerCase();
  const firestoreRole = String(data.role || "").toLowerCase();

  // Reliable role resolution: whitelist > firestore > claims > buyer fallback
  let finalRole = "buyer";
  if (isMasterAdmin) {
    finalRole = "admin";
  } else if (
    firestoreRole === "admin" ||
    firestoreRole === "super-admin" ||
    firestoreRole === "sub-admin" ||
    firestoreRole === "seller" ||
    firestoreRole === "host" ||
    firestoreRole === "buyer"
  ) {
    finalRole = firestoreRole;
  } else if (claimRole) {
    finalRole = claimRole;
  }

  // Update navbar
  if (loginLink) loginLink.style.display = "none";
  if (signupLink) signupLink.style.display = "none";

  if (userNameDisplay) {
    userNameDisplay.textContent = data.fullName;
  }

  // Handle role-based UI visibility
  const isPartner = finalRole === "seller" || finalRole === "host";

  if (isPartner) {
    document.querySelectorAll(".partner-only").forEach((el) => {
      el.classList.remove("partner-only");
    });

    // ISOLATION POLICY: Redirect partners away from buyer pages
    const buyerPages = [
      "index.html",
      "index.html",
      "catalogue.html",
      "cart.html",
      "product.html",
      "new-arrivals.html",
      "returns.html",
      "faq.html",
      "careers.html",
      "paperbag-autos.html",
      "paperbag-real-estate.html",
      "paperbag-stay.html",
      "bicycles.html",
    ];

    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";
    if (buyerPages.includes(currentPage)) {
      console.log(
        `Partner detected on buyer page (${currentPage}). Redirecting to Hub...`,
      );
      window.location.href = "account.html";
      return;
    }
  }

  if (finalRole === "admin") {
    document.querySelectorAll(".admin-only").forEach((el) => {
      el.classList.remove("admin-only");
    });
  }

  // If a non-admin lands on admin pages, block access.
  const isAdminLikeRole =
    finalRole === "admin" ||
    finalRole === "super-admin" ||
    finalRole === "sub-admin";
  // Non-admins are blocked from admin pages by page-level guards too.
  // Keep this redirect, but only when role resolution succeeded.
  if (isAdminPage && !isAdminLikeRole) {
    window.location.href = "index.html";
  }
});

function finalizeAdminUi() {
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.remove("admin-only");
  });
}
