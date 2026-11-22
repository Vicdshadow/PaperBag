import {
  auth,
  db,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  setDoc,
  doc,
  serverTimestamp,
  GoogleAuthProvider,
  signInWithPopup,
  getDoc,
  signOut,
} from "./firebase-config.js";

const form = document.getElementById("signupForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (email.toLowerCase().includes("@example.com")) {
    alert(
      "You cannot sign up with an official email address. Please use a personal email.",
    );
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match!");
    return;
  }

  try {
    console.log("Starting signup for:", email);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log("Auth user created:", cred.user.uid);

    // Get selected role from form
    const roleInput = document.getElementById("roleInput");
    const role = roleInput ? roleInput.value : "buyer";
    console.log("Selected role:", role);

    // 1. Try to create user document (Non-blocking / Fail-safe)
    try {
      await setDoc(doc(db, "users", cred.user.uid), {
        fullName,
        email,
        phone,
        role,
        status: role === "seller" || role === "host" ? "pending" : "active", // Both start as pending
        createdAt: serverTimestamp(),
      });
      console.log("Firestore user doc created successfully.");
    } catch (firestoreErr) {
      console.warn(
        "Firestore offline/failed, user doc will be created later:",
        firestoreErr,
      );
      // Continue anyway so user isn't stuck
    }

    // 2. Email verification sending disabled (as requested)
    /*
    let emailSent = false;
    try {
      await sendEmailVerification(cred.user);
      emailSent = true;
    } catch (emailErr) {
      console.warn("Failed to send verification email:", emailErr);
    }

    if (emailSent) {
      alert("Verification email sent! Please check your inbox.");
    }
    */

    // 3. Force logout (as requested in previous session)
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("SignOut failed, redirecting anyway", e);
    }

    alert("Account created successfully! Redirecting you to login...");
    window.location.replace("login.html");
  } catch (err) {
    console.error("Signup Error:", err);
    let msg = err.message;
    if (err.code === "auth/email-already-in-use") {
      // Capture intended role for upgrade during login
      const roleInput = document.getElementById("roleInput");
      if (roleInput && roleInput.value !== "buyer") {
        localStorage.setItem("intended_role", roleInput.value);
      }

      if (
        confirm(
          "This email is already registered. Would you like to go to the login page instead?",
        )
      ) {
        window.location.href = "login.html";
        return;
      }
      msg = "This email is already registered. Please login instead.";
    }
    alert("Signup failed: " + msg);
  }
});

// =========================
// GOOGLE SIGNUP
// =========================
const googleBtn = document.getElementById("googleBtn");

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    try {
      const GoogleAuthProvider = (await import("./firebase-config.js"))
        .GoogleAuthProvider;
      const signInWithPopup = (await import("./firebase-config.js"))
        .signInWithPopup;
      const getDoc = (await import("./firebase-config.js")).getDoc;

      // 0. Capture intended role from UI before popup (Using new hidden input)
      const roleInput = document.getElementById("roleInput");
      const selectedRole = roleInput ? roleInput.value : "buyer";
      console.log("Google Signup - Captured intended role:", selectedRole);

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // 1. Check if user document exists (Non-blocking)
      const userDocRef = doc(db, "users", user.uid);
      let userDocExists = false;

      try {
        const userDoc = await getDoc(userDocRef);
        userDocExists = userDoc.exists();
      } catch (e) {
        console.warn(
          "Could not check user doc (offline?), assuming new user flow might be needed later",
          e,
        );
      }

      // 2. If new user (or offline), try to create user document
      if (!userDocExists) {
        try {
          await setDoc(userDocRef, {
            fullName: user.displayName || "Google User",
            email: user.email,
            role: selectedRole, // Respect the selected role
            status:
              selectedRole === "seller" || selectedRole === "host"
                ? "pending"
                : "active",
            createdAt: serverTimestamp(),
            photoURL: user.photoURL || null,
          });

          /*
          // Try to send verification email
          try {
            await sendEmailVerification(user);
            alert(
              "Account created with Google! A verification email has been sent. Please verify your email before logging in.",
            );
          } catch (emailErr) {
            console.warn("Failed to send verification email:", emailErr);
            alert(
              "Account created with Google! Please verify your email before logging in.",
            );
          }
          */
          alert("Account created with Google! You can now log in.");
        } catch (docErr) {
          console.warn("Error creating user doc (offline?):", docErr);
          // If we couldn't create the doc, we still let them "signup/login"
          // The login page handles missing docs gracefully now too
          try {
            await signOut(auth);
          } catch (e) {}
          window.location.replace("login.html");
        }
      } else {
        alert("Account already exists! Redirecting to login...");
      }

      await signOut(auth);
      window.location.replace("login.html");
    } catch (err) {
      console.error("Google signup error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        // User closed popup, no need to show error
        return;
      }
      alert("Google signup failed: " + err.message);
    }
  });
}
