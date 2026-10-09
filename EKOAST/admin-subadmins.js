import {
  auth,
  db,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  collection,
  where,
  onAuthStateChanged,
  ADMIN_EMAILS,
  isAdminEmail,
} from "./firebase-config.js";

// Import secondary auth stuff to create users without logging out
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const subAdminListEl = document.getElementById("subAdminList");
const createForm = document.getElementById("createSubAdminForm");

function formatDate(value) {
  if (!value) return "N/A";
  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleDateString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString();
}

// Admin logic here:
// We need the firebaseConfig to initialize the secondary app
// I'll fetch it or assume it's exposed. Since it's in firebase-config.js but not exported as an object,
// I'll just re-define the essential parts here for the secondary app.
const firebaseConfig = {
  apiKey: "AIzaSyC14fkjgSZ0_vVSdZJxxLXE97DDB2ykCX4",
  authDomain: "ekoast.firebaseapp.com",
  projectId: "ekoast",
};
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

async function requireMainAdmin(user) {
  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  const isMasterAdmin = isAdminEmail(email);

  try {
    if (isMasterAdmin) return true;

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const role = String(userDoc.data()?.role || "").toLowerCase();
    if (role !== "admin" && role !== "super-admin") {
      alert("Main Admin Access Only");
      window.location.href = "admin-chats.html"; // Redirect sub-admins to chats
      return false;
    }
    return true;
  } catch (err) {
    console.error("Main Admin check failed:", err);
    // ✅ Allow master admin bypass
    if (isMasterAdmin) return true;
    window.location.href = "index.html";
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (await requireMainAdmin(user)) {
    const emailDisplay = document.getElementById("adminEmail");
    if (emailDisplay) emailDisplay.textContent = user.email;

    // Standard sidebar hiding (though sub-admins are redirected)
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const isSubAdmin = userDoc.data()?.role === "sub-admin";
    if (isSubAdmin) {
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        const text = btn.textContent.toLowerCase();
        if (
          !text.includes("chats") &&
          !text.includes("overview") &&
          !text.includes("reports")
        ) {
          btn.style.display = "none";
        }
      });
    }

    loadSubAdmins();
  }
});

async function loadSubAdmins() {
  const q = query(collection(db, "users"), where("role", "==", "sub-admin"));
  const snap = await getDocs(q);
  subAdminListEl.innerHTML = "";
  snap.forEach((d) => {
    const data = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${data.fullName}</td>
      <td>${data.email}</td>
      <td>${formatDate(data.createdAt)}</td>
      <td>
        <button class="btn btn-outline" style="color:red; border-color:red;" onclick="alert('Deletion currently disabled for safety. Contact system admin.')">Delete</button>
      </td>
    `;
    subAdminListEl.appendChild(tr);
  });
}

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("subAdminName").value;
  const email = document.getElementById("subAdminEmail").value;
  const password = document.getElementById("subAdminPassword").value;

  try {
    // 1. Create in Auth system (using secondary auth to avoid log out)
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    );
    const uid = userCredential.user.uid;

    // 2. Create in Firestore
    await setDoc(doc(db, "users", uid), {
      fullName: name,
      email: email,
      role: "sub-admin",
      status: "active",
      createdAt: Date.now(),
    });

    alert("Sub-Admin created successfully!");
    createForm.reset();
    loadSubAdmins();
  } catch (err) {
    alert("Error creating sub-admin: " + err.message);
  }
});
