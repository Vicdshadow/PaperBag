import {
  auth,
  onAuthStateChanged,
  signOut,
  db,
  getDoc,
  doc,
  updateDoc,
  ref,
  uploadBytes,
  getDownloadURL,
} from "./firebase-config.js";

const userNameEl = document.getElementById("userName");
const userEmailEl = document.getElementById("userEmail");
const logoutBtn = document.getElementById("logoutBtn");
const guestContent = document.getElementById("guestContent");
const userContent = document.getElementById("userContent");
const searchIcon = document.getElementById("searchIcon");
const searchInput = document.getElementById("searchInput");

// Search functionality
if (searchIcon && searchInput) {
  searchIcon.addEventListener("click", () => searchInput.focus());

  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim();
      if (query) {
        window.location.href = `index.html?search=${encodeURIComponent(query)}`;
      }
    }
  });
}

// Imports moved to top

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // User is signed in
    const name = user.displayName || user.email.split("@")[0];
    userNameEl.textContent = `Welcome ${name}!`;
    userEmailEl.textContent = user.email;

    // Set Profile Image
    const profileImg = document.getElementById("profileImage");
    if (user.photoURL) {
      profileImg.src = user.photoURL;
    }

    userContent.classList.remove("hidden");
    guestContent.classList.add("hidden");
    if (logoutBtn) logoutBtn.style.display = "block";

    // Handle role-based visibility & Fetch precise photoURL if updated in Firestore
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.photoURL) {
          profileImg.src = userData.photoURL;
        }

        if (userData.role === "seller" || userData.role === "host") {
          document.querySelectorAll(".partner-only").forEach((el) => {
            el.classList.remove("partner-only");
          });
        }
        if (userData.role === "admin") {
          document.querySelectorAll(".admin-only").forEach((el) => {
            el.classList.remove("admin-only");
          });
        }
      }
    } catch (err) {
      console.error("Error fetching user data:", err);
    }

    // --- Profile Picture Upload ---
    const fileInput = document.getElementById("profileUpload");
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const overlay = document.getElementById("uploadOverlay");
        overlay.style.display = "flex";

        try {
          const storageRef = ref(storage, `profile_pictures/${user.uid}`);
          await uploadBytes(storageRef, file);
          const downloadURL = await getDownloadURL(storageRef);

          // Update Firestore
          await updateDoc(doc(db, "users", user.uid), {
            photoURL: downloadURL,
          });

          // Update UI
          profileImg.src = downloadURL;
          alert("Profile picture updated!");
        } catch (err) {
          console.error("Upload failed:", err);
          alert("Failed to upload image.");
        } finally {
          overlay.style.display = "none";
        }
      });
    }
  } else {
    // Guest mode
    userContent.classList.add("hidden");
    guestContent.classList.remove("hidden");
    if (logoutBtn) logoutBtn.style.display = "none";
    // Ensure seller/admin items are hidden for guests
    document.querySelectorAll(".seller-only, .admin-only").forEach((el) => {
      el.classList.add("hidden");
    });
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      // Stay on page as guest
    } catch (error) {
      console.error("Error signing out:", error);
      alert("Error signing out. Please try again.");
    }
  });
}

// Newsletter subscription functionality
const newsletterSubmit = document.getElementById("newsletterSubmit");
const newsletterEmail = document.getElementById("newsletterEmail");

if (newsletterSubmit && newsletterEmail) {
  newsletterSubmit.addEventListener("click", () => {
    const email = newsletterEmail.value.trim();

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      alert("Please enter your email address.");
      return;
    }

    if (!emailRegex.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    // Store subscription in localStorage
    try {
      const subscribers = JSON.parse(
        localStorage.getItem("newsletterSubscribers") || "[]",
      );

      if (subscribers.includes(email)) {
        alert("You're already subscribed to our newsletter!");
        newsletterEmail.value = "";
        return;
      }

      subscribers.push(email);
      localStorage.setItem(
        "newsletterSubscribers",
        JSON.stringify(subscribers),
      );

      alert(
        "Thank you for subscribing! You'll receive exclusive updates from us.",
      );
      newsletterEmail.value = "";
    } catch (error) {
      console.error("Error saving subscription:", error);
      alert("Subscription successful! Thank you for joining our newsletter.");
      newsletterEmail.value = "";
    }
  });

  // Allow Enter key to submit
  newsletterEmail.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      newsletterSubmit.click();
    }
  });
}

