/*
 * EKOAST compliance & accessibility layer
 * - Cookie consent with granular, revocable choices (GDPR / UK GDPR / CCPA-style)
 * - Skip link, icon labels, safe external links, lazy images
 * Runs on every page without dependencies.
 */
(function () {
  "use strict";

  var CONSENT_KEY = "ekoast_cookie_consent_v1";
  var CONSENT_VERSION = 1;
  var eventName = "ekoast:consentchange";

  function readConsent() {
    try {
      var raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      var value = JSON.parse(raw);
      if (!value || value.version !== CONSENT_VERSION) return null;
      return value;
    } catch (e) {
      return null;
    }
  }

  function saveConsent(prefs) {
    var value = {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: !!prefs.analytics,
      marketing: !!prefs.marketing,
      ts: new Date().toISOString(),
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    } catch (e) {
      /* Storage disabled: honour choice for this page view only. */
    }
    window.__ekoastConsent = value;
    document.dispatchEvent(
      new CustomEvent(eventName, { detail: value })
    );
    if (banner) banner.hidden = true;
    if (preferencesOpen) togglePreferences(false);
    var status = document.getElementById("ekoast-consent-status");
    if (status) {
      status.textContent = "Your cookie preferences have been saved. You can change them at any time from the footer.";
    }
  }

  function addSkipLink() {
    if (document.querySelector(".ekoast-skip-link")) return;
    var main = document.querySelector("main") || document.getElementById("main-content");
    if (!main) {
      var h1 = document.querySelector("h1");
      main = h1 ? h1.parentElement : null;
    }
    if (!main) main = document.querySelector("section") || document.querySelector(".container");
    if (!main) return;
    if (!main.id) main.id = "main-content";
    var link = document.createElement("a");
    link.className = "ekoast-skip-link";
    link.href = "#" + main.id;
    link.textContent = "Skip to main content";
    document.body.insertBefore(link, document.body.firstChild);
  }

  function labelIconOnlyControls() {
    var labels = {
      "fa-user": "Account",
      "fa-user-circle": "Account",
      "fa-shopping-bag": "Shopping cart",
      "fa-shopping-cart": "Shopping cart",
      "fa-search": "Search",
      "fa-times-circle": "Clear search",
      "fa-times": "Close",
      "fa-comments": "Chat with us",
      "fa-comment": "Chat with us",
      "fa-bell": "Notifications",
      "fa-heart": "Wishlist",
      "fa-home": "Home",
      "fa-th": "Catalogue",
      "fa-th-large": "Catalogue",
      "fa-bars": "Open menu",
      "fa-chevron-left": "Previous",
      "fa-chevron-right": "Next",
      "fa-arrow-left": "Back",
      "fa-trash": "Remove",
      "fa-edit": "Edit",
      "fa-plus": "Add",
      "fa-minus": "Remove",
    };
    var nodes = document.querySelectorAll("a, button");
    Array.prototype.forEach.call(nodes, function (node) {
      var visibleText = node.textContent.replace(/\d+/g, "").trim();
      if (node.getAttribute("aria-label") || visibleText) return;
      var icon = node.querySelector("i[class*='fa-']");
      if (!icon) return;
      var classes = icon.className.split(/\s+/);
      for (var i = 0; i < classes.length; i++) {
        if (labels[classes[i]]) {
          node.setAttribute("aria-label", labels[classes[i]]);
          break;
        }
      }
    });
  }

  function hardenImagesAndLinks() {
    var images = document.querySelectorAll("img");
    Array.prototype.forEach.call(images, function (img) {
      if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
      if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
      if (!img.hasAttribute("alt")) img.setAttribute("alt", "");
    });
    Array.prototype.forEach.call(document.querySelectorAll("a[target='_blank']"), function (a) {
      var rel = (a.getAttribute("rel") || "").split(/\s+/);
      if (rel.indexOf("noopener") === -1) rel.push("noopener");
      if (rel.indexOf("noreferrer") === -1) rel.push("noreferrer");
      a.setAttribute("rel", rel.join(" "));
    });
  }

  function addFooterLegalLinks() {
    if (document.querySelector(".ekoast-footer-legal")) return;
    var footer = document.querySelector("footer.site-footer") || document.querySelector("footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "site-footer";
      document.body.appendChild(footer);
    }
    var nav = document.createElement("nav");
    nav.className = "ekoast-footer-legal";
    nav.setAttribute("aria-label", "Legal and privacy information");
    nav.innerHTML =
      '<a href="privacy.html">Privacy Policy</a>' +
      '<a href="legal.html">Terms &amp; Conditions</a>' +
      '<a href="cookies.html">Cookie Policy</a>' +
      '<a href="accessibility.html">Accessibility</a>' +
      '<a href="returns.html">Returns &amp; Refunds</a>' +
      '<button type="button" class="ekoast-cookie-settings" id="ekoast-footer-cookie-settings">Cookie settings</button>';
    footer.appendChild(nav);
    var button = document.getElementById("ekoast-footer-cookie-settings");
    if (button) button.addEventListener("click", openPreferences);
  }

  var banner = null;
  var preferencesOpen = false;

  function togglePreferences(show) {
    preferencesOpen = !!show;
    if (banner) banner.classList.toggle("is-configuring", preferencesOpen);
  }

  function openPreferences() {
    if (!banner) {
      buildBanner();
      if (!banner) return;
    }
    banner.hidden = false;
    togglePreferences(true);
    var first = banner.querySelector("input[type='checkbox']:not([disabled])");
    if (first) first.focus();
  }

  function buildBanner() {
    if (banner) return;
    var existing = readConsent();
    banner = document.createElement("aside");
    banner.className = "ekoast-consent";
    banner.id = "ekoast-consent-banner";
    banner.setAttribute("aria-label", "Cookie consent");
    banner.setAttribute("role", "region");
    banner.innerHTML =
      '<div class="ekoast-consent__copy">' +
      '<strong class="ekoast-consent__title">Your privacy, your choice</strong>' +
      '<p>We use essential cookies to keep this site working. With your permission, we also use optional cookies for analytics and personalisation. You can accept all, reject optional cookies, or choose below. <a href="cookies.html">Read our Cookie Policy</a>.</p>' +
      '<p id="ekoast-consent-status" class="ekoast-sr-only" role="status" aria-live="polite"></p>' +
      "</div>" +
      '<div class="ekoast-consent__actions">' +
      '<button type="button" id="ekoast-accept-all">Accept all</button>' +
      '<button type="button" id="ekoast-reject-optional" class="ekoast-consent__secondary">Reject optional</button>' +
      '<button type="button" id="ekoast-manage" class="ekoast-consent__secondary" aria-expanded="false" aria-controls="ekoast-consent-prefs">Manage preferences</button>' +
      "</div>" +
      '<div class="ekoast-consent__prefs" id="ekoast-consent-prefs">' +
      "<fieldset><legend>Optional cookie categories</legend>" +
      '<label><input type="checkbox" checked disabled> <span><strong>Strictly necessary</strong><small>Required for sign-in, cart, checkout and security. Always on.</small></span></label>' +
      '<label><input type="checkbox" id="ekoast-pref-analytics"> <span><strong>Analytics</strong><small>Helps us understand how the store is used so we can improve it.</small></span></label>' +
      '<label><input type="checkbox" id="ekoast-pref-marketing"> <span><strong>Personalisation &amp; marketing</strong><small>Used to show relevant offers and remember your preferences.</small></span></label>' +
      "</fieldset>" +
      '<button type="button" id="ekoast-save-prefs">Save my choices</button>' +
      "</div>";
    document.body.appendChild(banner);

    if (existing) {
      banner.hidden = true;
      var a = document.getElementById("ekoast-pref-analytics");
      var m = document.getElementById("ekoast-pref-marketing");
      if (a) a.checked = !!existing.analytics;
      if (m) m.checked = !!existing.marketing;
    }

    document.getElementById("ekoast-accept-all").addEventListener("click", function () {
      saveConsent({ analytics: true, marketing: true });
    });
    document.getElementById("ekoast-reject-optional").addEventListener("click", function () {
      saveConsent({ analytics: false, marketing: false });
    });
    document.getElementById("ekoast-manage").addEventListener("click", function () {
      togglePreferences(!preferencesOpen);
      this.setAttribute("aria-expanded", preferencesOpen ? "true" : "false");
    });
    document.getElementById("ekoast-save-prefs").addEventListener("click", function () {
      saveConsent({
        analytics: document.getElementById("ekoast-pref-analytics").checked,
        marketing: document.getElementById("ekoast-pref-marketing").checked,
      });
    });
  }

  function init() {
    window.__ekoastConsent = readConsent();
    addSkipLink();
    labelIconOnlyControls();
    hardenImagesAndLinks();
    addFooterLegalLinks();
    buildBanner();

    window.ekoastOpenCookieSettings = openPreferences;
    var openBtn = document.getElementById("ekoast-open-cookie-settings");
    if (openBtn) openBtn.addEventListener("click", openPreferences);
    if (location.search.indexOf("cookie-settings") !== -1) openPreferences();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
