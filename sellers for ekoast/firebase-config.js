// firebase-config.js
// Firebase Configuration

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  initializeFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  enableNetwork,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC14fkjgSZ0_vVSdZJxxLXE97DDB2ykCX4",
  authDomain: "ekoast.firebaseapp.com",
  databaseURL: "https://ekoast-default-rtdb.firebaseio.com",
  projectId: "ekoast",
  storageBucket: "ekoast.firebasestorage.app",
  messagingSenderId: "887917457934",
  appId: "1:887917457934:web:56b1d42577a477f472c25f",
  measurementId: "G-C0CBDSTLMF",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Use auto-detected long-polling fallback for restrictive networks/proxies.
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});
const storage = getStorage(app);

// ✅ Force Firestore into online mode to fix offline errors
enableNetwork(db).catch((err) => {
  console.warn("Could not enable network:", err);
});

let analytics;
if (location.hostname !== "localhost") {
  analytics = getAnalytics(app);
}

// Check for file:// protocol
if (location.protocol === "file:") {
  alert(
    "CRITICAL: EKOAST is running via 'file://'. Firebase Authentication WILL NOT work. Please use a local web server (e.g., VS Code Live Server).",
  );
}

// ⚠️ APP CHECK TEMPORARILY DISABLED FOR DEVELOPMENT
// App Check was causing 403 errors with Google login during development.
// To re-enable for production:
// 1. Uncomment the code below
// 2. Register debug tokens in Firebase Console (for localhost testing)
// 3. Or configure reCAPTCHA properly for your domain

/*
// Initialize App Check with reCAPTCHA v3
// Add this line to enable debug tokens for localhost testing
if (
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.protocol === "file:"
) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

// Replace 'YOUR_RECAPTCHA_V3_SITE_KEY' with your actual reCAPTCHA v3 site key
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6Lcf_mMsAAAAADE8qOU92pjhVGZhbDv2WUvtRZr0"),
  isTokenAutoRefreshEnabled: true,
});
*/

// Marketplace constants — any user with role="seller" in Firestore gets seller access
export const STATUS_ESCROW = "escrow";
export const STATUS_VERIFIED = "verified";
export const STATUS_RELEASED = "released";

// Payment Configs (Placeholders)
export const PAYSTACK_PUBLIC_KEY = "pk_live_REPLACE_ME";
export const OPAY_LINK = "https://YOUR-OPAY-MERCHANT-LINK";

// Export everything needed by the app
export {
  app,
  analytics,
  auth,
  db,
  storage,
  // Auth Functions
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  // Firestore Functions
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
  enableNetwork,
  // Storage Functions
  ref,
  uploadBytes,
  getDownloadURL,
};

