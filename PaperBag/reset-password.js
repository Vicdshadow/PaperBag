import {
  auth,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "./firebase-config.js";

const form = document.getElementById("resetForm");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");

// Get the action code (oobCode) from the URL
const urlParams = new URLSearchParams(window.location.search);
const oobCode = urlParams.get("oobCode");

if (!oobCode) {
  alert("Invalid reset link. Please request a new password reset.");
  window.location.href = "login.html";
} else {
  // Verify the code
  verifyPasswordResetCode(auth, oobCode)
    .then((email) => {
      // Code is valid
      console.log("Resetting password for: " + email);
    })
    .catch((error) => {
      alert("Invalid or expired reset link. " + error.message);
      window.location.href = "login.html";
    });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  try {
    await confirmPasswordReset(auth, oobCode, newPassword);
    alert(
      "Password verified and updated successfully. Please login with your new password.",
    );
    window.location.href = "login.html";
  } catch (error) {
    console.error(error);
    alert("Error resetting password: " + error.message);
  }
});

