import {
  auth,
  db,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  ADMIN_EMAILS,
  isAdminEmail,
} from "./firebase-config.js";

const form = document.getElementById("loginForm");
const googleBtn = document.getElementById("googleBtn");
const appleBtn = document.getElementById("appleBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

// ✅ AUTO REDIRECT IF ALREADY LOGGED IN
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Check for "Welcome" fireworks
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "success") {
      triggerWelcome();
    }
    return;
  }
  await handleLoginSuccess(user);
});

function triggerWelcome() {
  const overlay = document.getElementById("welcomeOverlay");
  if (!overlay) return;

  overlay.classList.add("active");

  const duration = 5 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function () {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    // since particles fall down, start a bit higher than random
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}

// =========================
// PASSWORD RESET
// =========================
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    if (!email) {
      alert("Enter your email first.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent.");
    } catch (err) {
      alert(err.message);
    }
  });
}

// =========================
// LOGIN SUCCESS HANDLER
// =========================
async function handleLoginSuccess(user) {
  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  const isWhitelistedAdmin = isAdminEmail(email);

  // Hard guard: whitelisted admin should never be routed to buyer flows.
  if (isWhitelistedAdmin) {
    // Non-blocking sync to prevent hanging on Firestore initialization issues
    setDoc(
      doc(db, "users", user.uid),
      {
        email: user.email || "",
        fullName: user.displayName || "Admin",
        role: "admin",
        status: "active",
        updatedAt: new Date(),
      },
      { merge: true },
    ).catch((error) => {
      console.warn("Admin profile sync skipped (Firestore issue):", error);
    });

    window.location.href = "admin.html";
    return;
  }

  let tokenRole = "";
  try {
    const token = await user.getIdTokenResult(true);
    tokenRole = String(token.claims.role || "").toLowerCase();
  } catch (error) {
    console.warn("Could not read token claims:", error);
  }
  // ✅ EMAIL VERIFICATION CHECK (DISABLED BY USER REQUEST)
  /*
  try {
    await user.reload();
  } catch (err) {
    console.warn("User reload failed (offline?):", err);
  }

  if (!user.emailVerified) {
    alert("Please verify your email before logging in.");
    await signOut(auth);
    return;
  }
  */

  // =========================
  // MERGE GUEST CART (Fail-safe)
  // =========================
  try {
    const guestCart = JSON.parse(localStorage.getItem("guest_cart") || "[]");

    if (guestCart.length > 0) {
      for (const item of guestCart) {
        const ref = doc(db, "users", user.uid, "cart", item.id);
        // Use a timeout race to prevent hanging if offline
        // This is a simple fire-and-forget approach for offline resilience
        getDoc(ref)
          .then(async (snap) => {
            if (snap.exists()) {
              await updateDoc(ref, { qty: (snap.data().qty || 0) + item.qty });
            } else {
              await setDoc(ref, item);
            }
          })
          .catch((e) => console.warn("Cart merge failed (offline):", e));
      }
      localStorage.removeItem("guest_cart");
    }
  } catch (e) {
    console.warn("Guest cart merge skipped:", e);
  }

  // =========================
  // GET USER DATA (Fail-safe)
  // =========================
  let userData = null;

  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      userData = userDoc.data();
    }
  } catch (err) {
    console.warn("Could not retrieve user profile (offline?):", err);
    // Fallback: Proceed as buyer if we can't check role
  }

  if (!userData) {
    if (isWhitelistedAdmin || tokenRole === "admin") {
      // Safety net for admin accounts when profile document is missing
      setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email || "",
          fullName: user.displayName || "Admin",
          role: "admin",
          status: "active",
          createdAt: new Date(),
        },
        { merge: true },
      ).catch((e) => {
        console.warn(
          "Could not auto-create admin profile (Firestore issue):",
          e,
        );
      });
      window.location.href = "admin.html";
      return;
    }

    console.log("No user data found. Redirecting to account for setup.");
    window.location.href = "account.html?setup=required";
    return;
  }

  // =========================
  // ROLE UPGRADE CHECK
  // =========================
  const intendedRole = localStorage.getItem("intended_role");
  if (
    intendedRole &&
    (intendedRole === "seller" || intendedRole === "host") &&
    userData.role === "buyer"
  ) {
    const upgradeConfirmed = confirm(
      `We noticed you tried to sign up as a ${intendedRole}. Would you like to upgrade your account now?`,
    );
    if (upgradeConfirmed) {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          role: intendedRole,
          status: "pending", // Reset to pending for admin review
          onboardingComplete: false, // Ensure they go through onboarding
        });
        userData.role = intendedRole;
        userData.onboardingComplete = false;
        localStorage.removeItem("intended_role");
        alert("Account upgraded! Taking you to onboarding...");
      } catch (err) {
        console.error("Upgrade failed:", err);
      }
    } else {
      localStorage.removeItem("intended_role");
    }
  }

  // =========================
  // ADMIN ROLE CHECK
  // =========================
  const firestoreRole = String(userData.role || "").toLowerCase();
  const isAdminUser =
    isWhitelistedAdmin ||
    tokenRole === "admin" ||
    firestoreRole === "admin" ||
    firestoreRole === "super-admin" ||
    firestoreRole === "sub-admin";

  if (isAdminUser) {
    if (firestoreRole !== "admin" && isWhitelistedAdmin) {
      // Keep admin profile role consistent to prevent buyer redirects later
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { role: "admin", status: userData.status || "active" },
          { merge: true },
        );
      } catch (err) {
        console.warn("Could not sync admin role:", err);
      }
    }
    window.location.href = "admin.html";
    return;
  }

  // =========================
  // SELLER / HOST
  // =========================
  if (userData.role === "seller" || userData.role === "host") {
    // If onboarding is NOT complete, always allow them to reach the onboarding page
    if (!userData.onboardingComplete) {
      console.log(
        `${userData.role} onboarding incomplete. Redirecting to registration...`,
      );
      window.location.href = "seller-onboarding.html";
      return;
    }

    // They are sellers or hosts. We might have a unified dashboard later,
    // but for now, send them to account if no other onboarding.
    window.location.href = "account.html";
    return;
  }

  // =========================
  // BUYER
  // =========================
  const urlParams = new URLSearchParams(window.location.search);
  const redirectParam = urlParams.get("redirect");
  const allowedPages = ["account", "checkout", "cart", "wishlist", "orders", "service-detail", "product", "index", "support", "inbox", "catalogue"];
  let target = "account.html";
  if (redirectParam) {
    const name = redirectParam.replace(/\.html$/i, "").split(/[\\/]/).pop();
    if (allowedPages.indexOf(name) !== -1) target = name + ".html";
  }
  window.location.href = target;
}

// =========================
// LOGIN FORM
// =========================
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
      console.log("Attempting login for:", email);
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
      btn.disabled = true;

      const cred = await signInWithEmailAndPassword(auth, email, password);
      console.log("Login successful, handling success for:", cred.user.email);
      await handleLoginSuccess(cred.user);
    } catch (err) {
      console.error("Full Login Error:", err);
      btn.innerHTML = originalText;
      btn.disabled = false;

      if (err.code === "auth/network-request-failed") {
        alert(
          "Login failed: Network error. Please ensure you're using a local server (like VS Code Live Server) and not opening the file directly.",
        );
      } else if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        alert(
          "Login failed: Incorrect email or password. Please double-check your credentials or use the 'Forgot Password' link below.",
        );
      } else {
        alert("Login failed: " + err.message);
      }
    }
  });
}

// =========================
// GOOGLE LOGIN
// =========================
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user document exists
      const userDocRef = doc(db, "users", user.uid);

      let userDoc;
      try {
        userDoc = await getDoc(userDocRef);
      } catch (firestoreErr) {
        // Handle Firestore offline errors
        if (firestoreErr.message.includes("offline")) {
          console.warn(
            "Firestore offline, attempting to continue with cached data",
          );
          // Try to proceed anyway - user might exist from previous login
          try {
            await handleLoginSuccess(user);
            return;
          } catch (loginErr) {
            alert(
              "⚠️ Network issue detected. Please check your internet connection and try again.",
            );
            await signOut(auth);
            return;
          }
        }
        throw firestoreErr;
      }

      // If new user, create user document
      if (!userDoc.exists()) {
        const storedRole = localStorage.getItem("intended_role") || "buyer";
        console.log("Creating new Google user profile with role:", storedRole);

        try {
          await setDoc(userDocRef, {
            fullName: user.displayName || "Google User",
            email: user.email,
            role: storedRole,
            status:
              storedRole === "seller" || storedRole === "host"
                ? "pending"
                : "active",
            createdAt: new Date(),
            photoURL: user.photoURL || null,
          });
          localStorage.removeItem("intended_role"); // Clear it after use
        } catch (setDocErr) {
          console.error("Error creating user document:", setDocErr);
          alert(
            "⚠️ Account created but profile setup failed. Please refresh and try logging in again.",
          );
          return;
        }
      }

      // Proceed with login
      await handleLoginSuccess(user);
    } catch (err) {
      console.error("Google login error:", err);

      // Ignore cancelled popup errors (happens when user clicks button multiple times)
      if (err.code === "auth/cancelled-popup-request") {
        console.log("Popup cancelled - user clicked button again");
        return;
      }

      if (err.code === "auth/popup-closed-by-user") {
        // User closed popup, no need to show error
        return;
      }
      alert("Google login failed: " + err.message);
    }
  });
}

// =========================
// APPLE LOGIN
// =========================
if (appleBtn) {
  appleBtn.addEventListener("click", async () => {
    try {
      const provider = new OAuthProvider("apple.com");
      const result = await signInWithPopup(auth, provider);
      await handleLoginSuccess(result.user);
    } catch (err) {
      alert(err.message);
    }
  });
}
