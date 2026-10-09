/**
 * preloader.js
 * Handles the dismissal of the site preloader.
 */
window.addEventListener("load", () => {
  const preloader = document.getElementById("preloader");
  if (preloader) {
    // Add fade-out class to trigger CSS transition
    preloader.classList.add("fade-out");

    // Remove from DOM after transition completes (800ms match with CSS)
    setTimeout(() => {
      preloader.remove();
    }, 800);
  }
});

