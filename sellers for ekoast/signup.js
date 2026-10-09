import {
  auth,
  db,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  setDoc,
  doc,
  serverTimestamp,
} from "./firebase-config.js";

const signupForm = document.getElementById("signup-form");
const signupBtn = document.getElementById("signup-btn");
const alertBox = document.getElementById("signup-alert");
const alertMsg = document.getElementById("signup-alert-msg");
const successView = document.getElementById("success-view");
const signupView = document.getElementById("signup-view");
const successMsgEl = document.getElementById("success-msg");
const passwordInput = document.getElementById("signup-password");

const FIREBASE_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

if (signupForm) {
  if (passwordInput) {
    passwordInput.addEventListener("input", () => {
      const val = passwordInput.value;
      const wrap = document.getElementById("strength-wrap");

      if (!val) {
        wrap.style.display = "none";
        return;
      }
      wrap.style.display = "block";

      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      const bars = ["bar1", "bar2", "bar3", "bar4"].map((id) =>
        document.getElementById(id),
      );
      const texts = ["Weak", "Fair", "Good", "Strong"];
      const cls = ["weak", "fair", "good", "strong"];

      bars.forEach((bar, i) => {
        bar.className =
          "strength-bar" + (i < score ? " " + cls[score - 1] : "");
      });
      document.getElementById("strength-text").textContent =
        texts[score - 1] || "Too Short";
    });
  }

  makeToggle("toggle-pw", "signup-password");
  makeToggle("toggle-confirm-pw", "confirm-password");

  function makeToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener("click", () => {
      const input = document.getElementById(inputId);
      const icon = document.querySelector(`#${btnId} i`);
      if (input.type === "password") {
        input.type = "text";
        icon.className = "fas fa-eye-slash";
      } else {
        input.type = "password";
        icon.className = "fas fa-eye";
      }
    });
  }

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const name = document.getElementById("full-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("confirm-password").value;
    const role = document.getElementById("selected-role").value || "seller";

    if (!name) {
      showAlert("Please enter your full name.");
      return;
    }
    if (password.length < 8) {
      showAlert("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      showAlert("Passwords do not match.");
      return;
    }

    signupBtn.disabled = true;
    signupBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Creating Account...';

    try {
      const { user } = await withTimeout(
        createUserWithEmailAndPassword(auth, email, password),
        FIREBASE_TIMEOUT_MS,
        "Signup is taking too long. Please check your internet and try again.",
      );

      await withTimeout(
        sendEmailVerification(user),
        FIREBASE_TIMEOUT_MS,
        "Could not send verification email right now. Please try again shortly.",
      );

      await withTimeout(
        setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          name,
          email,
          role,
          createdAt: serverTimestamp(),
          status: "active",
        }),
        FIREBASE_TIMEOUT_MS,
        "Account created, but profile sync is delayed. Please log in again.",
      );

      await withTimeout(signOut(auth), 5000, "Sign-out timeout.");

      if (successMsgEl) {
        successMsgEl.textContent =
          "Your Seller account is ready! Please check your email inbox to verify your account, then log in to start selling.";
      }

      if (signupView) signupView.style.display = "none";
      if (successView) successView.style.display = "block";
    } catch (err) {
      console.error("Signup error:", err);
      showAlert(friendlyError(err.code || err.message));
    } finally {
      signupBtn.disabled = false;
      signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
    }
  });

  function showAlert(msg) {
    if (alertMsg && alertBox) {
      alertMsg.textContent = msg;
      alertBox.classList.add("show");
    }
  }

  function hideAlert() {
    if (alertBox) alertBox.classList.remove("show");
  }

  function friendlyError(code) {
    const map = {
      "auth/email-already-in-use":
        "An account already exists with this email. Try logging in.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password": "Password is too weak. Use at least 8 characters.",
      "auth/network-request-failed":
        "Network error. Check your connection and try again.",
      "auth/operation-not-allowed":
        "Email sign-up is not enabled. Please contact support.",
      "Signup is taking too long. Please check your internet and try again.":
        "Signup is taking too long. Check your internet and try again.",
      "Could not send verification email right now. Please try again shortly.":
        "We couldn't send a verification email now. Please try again shortly.",
      "Account created, but profile sync is delayed. Please log in again.":
        "Account created, but profile sync is delayed. Please log in again.",
      "Sign-out timeout.": "Account created. Please proceed to login.",
    };
    return map[code] || "Something went wrong. Please try again.";
  }
}

