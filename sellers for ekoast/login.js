import {
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  db,
  doc,
  getDoc,
  setDoc,
  enableNetwork,
  serverTimestamp,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from "./firebase-config.js";

// ── Already logged in? Redirect appropriately ──
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await redirectByRole(user);
  }
});

// ── Login Form ──
const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginAlert = document.getElementById("login-alert");
const loginMsg = document.getElementById("login-alert-msg");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    hideAlert(loginAlert);
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await redirectByRole(credential.user);
    } catch (err) {
      showAlert(loginAlert, "error", friendlyError(err.code));
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Log In';
    }
  });
}

// ── Social Login ──
const googleBtn = document.getElementById("google-login-btn");
const appleBtn = document.getElementById("apple-login-btn");

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    await handleSocialLogin(provider);
  });
}

if (appleBtn) {
  appleBtn.addEventListener("click", async () => {
    const provider = new OAuthProvider("apple.com");
    await handleSocialLogin(provider);
  });
}

async function handleSocialLogin(provider) {
  hideAlert(loginAlert);
  if (googleBtn) googleBtn.disabled = true;
  if (appleBtn) appleBtn.disabled = true;

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if user exists in Firestore
    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);

    if (!snap.exists()) {
      // First time social login on seller portal - create seller record
      await setDoc(userDocRef, {
        uid: user.uid,
        name: user.displayName || "New Seller",
        email: user.email,
        role: "seller", // Default to seller for this specific portal
        createdAt: serverTimestamp(),
        status: "active",
      });
    }

    await redirectByRole(user);
  } catch (err) {
    showAlert(loginAlert, "error", friendlyError(err.code));
  } finally {
    if (googleBtn) googleBtn.disabled = false;
    if (appleBtn) appleBtn.disabled = false;
  }
}

// ── Role-based redirect ──
const roleCacheKey = (uid) => `ekoast_role_${uid}`;

function getCachedRole(uid) {
  try {
    return localStorage.getItem(roleCacheKey(uid));
  } catch {
    return null;
  }
}

function cacheRole(uid, role) {
  try {
    localStorage.setItem(roleCacheKey(uid), role);
  } catch {}
}

async function redirectByRole(user, retries = 2) {
  try {
    // Attempt to force the network online
    await enableNetwork(db).catch(() => {});

    const snap = await getDoc(doc(db, "users", user.uid));
    let role = snap.exists() ? snap.data().role : "buyer";

    // ✅ FORCE UPGRADE: If user is landing on the seller site, they ARE a seller.
    if (role === "buyer") {
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { role: "seller" },
          { merge: true },
        );
        role = "seller";
      } catch (e) {
        console.error("Auto-upgrade failed:", e);
      }
    }

    cacheRole(user.uid, role);

    if (role === "seller") {
      window.location.href = "index.html";
    } else if (role === "admin") {
      window.location.href = "admin.html";
    } else {
      // Fallback if something went wrong
      window.location.href = "index.html";
    }
  } catch (err) {
    console.error("Redirect logic error:", err);

    // Specifically handle 'offline' errors with a retry
    if (
      err.message &&
      err.message.toLowerCase().includes("offline") &&
      retries > 0
    ) {
      console.warn(
        `Firestore offline. Retrying redirect in 2s... (${retries} left)`,
      );
      setTimeout(() => redirectByRole(user, retries - 1), 2000);
      return;
    }

    const cachedRole = getCachedRole(user.uid);
    if (cachedRole === "admin") {
      window.location.href = "admin.html";
      return;
    }

    // Offline fallback: use last known seller role when Firestore cannot be reached.
    if (cachedRole === "seller") {
      window.location.href = "index.html";
      return;
    }

    // If Firestore read fails completely, default to hub.
    window.location.href = "index.html";
  }
}

// ── Password Reset ──
const forgotLink = document.getElementById("forgot-link");
const backBtn = document.getElementById("back-btn");
const loginView = document.getElementById("login-view");
const forgotView = document.getElementById("forgot-view");
const resetForm = document.getElementById("reset-form");
const resetBtn = document.getElementById("reset-btn");
const resetAlert = document.getElementById("reset-alert");
const resetMsg = document.getElementById("reset-alert-msg");

if (forgotLink) {
  forgotLink.addEventListener("click", (e) => {
    e.preventDefault();
    loginView.style.display = "none";
    forgotView.style.display = "block";
  });
}

if (backBtn) {
  backBtn.addEventListener("click", () => {
    forgotView.style.display = "none";
    loginView.style.display = "block";
  });
}

if (resetForm) {
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("reset-email").value.trim();

    resetBtn.disabled = true;
    resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    try {
      await sendPasswordResetEmail(auth, email);
      resetAlert.className = "alert alert-success show";
      resetMsg.textContent = "Reset link sent! Check your inbox.";
      resetForm.reset();
    } catch (err) {
      resetAlert.className = "alert alert-error show";
      resetMsg.textContent = friendlyError(err.code);
    } finally {
      resetBtn.disabled = false;
      resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
    }
  });
}

// ── Helpers ──
function showAlert(el, type, msg) {
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.querySelector("span").textContent = msg;
}
function hideAlert(el) {
  if (el) el.classList.remove("show");
}

function friendlyError(code) {
  const map = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
  };
  return map[code] || "Login failed. Please try again.";
}

// ── Toggle Password Visibility ──
const toggleLoginPw = document.getElementById("toggle-login-pw");
if (toggleLoginPw) {
  toggleLoginPw.addEventListener("click", () => {
    const input = document.getElementById("login-password");
    const icon = document.querySelector("#toggle-login-pw i");
    if (input.type === "password") {
      input.type = "text";
      icon.className = "fas fa-eye-slash";
    } else {
      input.type = "password";
      icon.className = "fas fa-eye";
    }
  });
}

