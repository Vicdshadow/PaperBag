// SIMPLIFIED GOOGLE LOGIN - USE THIS IF FIRESTORE IS OFFLINE
// Replace the Google login section in login.js with this code

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      console.log("✅ Google authentication successful:", user.email);

      // Try to create/check user document, but don't block if Firestore is offline
      setTimeout(async () => {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);

          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              fullName: user.displayName || "Google User",
              email: user.email,
              role: "buyer",
              status: "active",
              createdAt: new Date(),
              photoURL: user.photoURL || null,
            });
            console.log("✅ User document created");
          }
        } catch (err) {
          console.warn(
            "Firestore unavailable, user doc will be created later:",
            err.message,
          );
        }
      }, 100);

      // Redirect immediately - don't wait for Firestore
      alert("✅ Login successful! Welcome " + (user.displayName || user.email));
      window.location.href = "account.html";
    } catch (err) {
      console.error("Google login error:", err);
      if (err.code === "auth/popup-closed-by-user") {
        return;
      }
      alert("Google login failed: " + err.message);
    }
  });
}

