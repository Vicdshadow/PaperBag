// firebase-config.js
// Firebase Configuration

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
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
  getFirestore,
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
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

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
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Could not set auth persistence:", err);
});
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// ✅ Force Firestore into online mode to fix offline errors
enableNetwork(db).catch((err) => {
  console.warn("Could not enable network:", err);
});

let analytics;
if (location.hostname !== "localhost") {
  analytics = getAnalytics(app);
}

// Check for file:// protocol
// Payment Configs (Placeholders)
export const PAYSTACK_PUBLIC_KEY = "pk_live_REPLACE_ME";
export const OPAY_LINK = "https://YOUR-OPAY-MERCHANT-LINK";

// Admin configuration
export const ADMIN_EMAILS = [
  "support@example.com",
  "support@ekoast.com",
  "admin@ekoast.com",
  "ekoast047@gmail.com",
];

/**
 * Centralized helper to check if an email belongs to an administrator.
 * Matches specific whitelisted emails OR any email ending with @ekoast.com.
 */
export function isAdminEmail(email) {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  return ADMIN_EMAILS.includes(e) || e.endsWith("@ekoast.com");
}

// Export everything needed by the app
export {
  app,
  analytics,
  auth,
  db,
  storage,
  functions,
  getFunctions,
  httpsCallable,
  // Auth Functions
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
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
  // Storage Functions
  ref,
  uploadBytes,
  getDownloadURL,
};

// Application Constants
export const STATUS_ESCROW = "escrow";
export const STATUS_VERIFIED = "verified";
export const STATUS_RELEASED = "released";
export const SELLER_EMAIL = "support@ekoast.com";
