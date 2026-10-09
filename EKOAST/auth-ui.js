import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
} from "./firebase-config.js";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      // In mock auth, getDoc returns { exists: fn, data: fn }
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.role === "seller" || userData.role === "host") {
          updateUIForRole(userData.role);
        } else if (userData.role === "admin") {
          updateUIForRole("admin");
        }
      }
    } catch (err) {
      console.error("Error in global auth check:", err);
    }
  }
});

function updateUIForRole(role) {
  // Show elements with matching role class
  document.querySelectorAll(`.${role}-only`).forEach((el) => {
    el.classList.remove(`${role}-only`);
    el.classList.remove("hidden");
  });
}

