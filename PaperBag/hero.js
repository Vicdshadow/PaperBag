// PaperBag — product slideshow hero.
import { db, collection, getDocs, limit } from "./firebase-config.js";

(function () {
  "use strict";
  const root = document.getElementById("pbHero");
  if (!root) return;

  const track = document.getElementById("pbHeroTrack");
  const dotsHost = document.getElementById("pbHeroDots");
  const status = document.getElementById("pbHeroStatus");
  const prevBtn = document.getElementById("pbHeroPrev");
  const nextBtn = document.getElementById("pbHeroNext");
  if (!track || !dotsHost) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let products = [];
  let index = 0;
  let timer = null;

  const money = (n) => "₦" + Number(n || 0).toLocaleString();
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
    );

  function imageOf(p) {
    return (
      p.imageUrl ||
      p.imageURL ||
      p.image ||
      (Array.isArray(p.images) && p.images[0]) ||
      "assets/images/placeholder.svg"
    );
  }

  function paydaySlide() {
    return `
      <article class="pb-hero__slide pb-hero__slide--payday" aria-label="Payday offers">
        <div class="pb-torn-edge" aria-hidden="true"></div>
        <div class="pb-hero__copy">
          <span class="pb-hero__eyebrow"><i class="fas fa-tag"></i> This week only</span>
          <h2 class="pb-hero__title">PAY <span>DAY</span> OFFERS</h2>
          <p class="pb-hero__subtitle">When salary drops, prices drop. Fresh finds at prices that feel like a gift.</p>
          <div class="pb-hero__price"><strong>UP TO 45% OFF</strong><s>selected items</s></div>
          <a href="#flash-sales" class="pb-hero__cta">SHOP THE DEALS <i class="fas fa-arrow-right"></i></a>
        </div>
        <div class="pb-hero__media">
          <img src="assets/images/smartphone.jpg" alt="Payday smartphone offers" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
        </div>
      </article>`;
  }

  function productSlide(p, i) {
    const img = esc(imageOf(p));
    const name = esc(p.name || p.title || p.productName || "Featured pick");
    const price = money(p.price || p.currentPrice || p.discountedPrice || 0);
    const old = p.comparePrice || p.oldPrice || p.originalPrice;
    const cat = esc(p.category || p.categoryName || "Featured");
    return `
      <article class="pb-hero__slide pb-hero__slide--product" aria-label="${name}">
        <div class="pb-hero__copy">
          <span class="pb-hero__eyebrow"><i class="fas fa-star"></i> ${cat}</span>
          <h2 class="pb-hero__title">${name}</h2>
          <p class="pb-hero__subtitle">Hand-picked from the PaperBag marketplace. Quality you can trust, delivered nationwide.</p>
          <div class="pb-hero__price"><strong>${price}</strong>${old ? `<s>${money(old)}</s>` : ""}</div>
          <a href="product.html?id=${encodeURIComponent(p.id || "")}" class="pb-hero__cta">VIEW PRODUCT <i class="fas fa-arrow-right"></i></a>
        </div>
        <div class="pb-hero__media">
          <img src="${img}" alt="${name}" loading="lazy" decoding="async"
               onerror="this.src='assets/images/placeholder.svg'" />
        </div>
      </article>`;
  }

  function render() {
    const list = [paydaySlide()].concat(products.map(productSlide));
    track.innerHTML = list.join("");
    dotsHost.innerHTML = list
      .map(
        (_, i) =>
          `<button type="button" class="pb-hero__dot${i === 0 ? " is-active" : ""}" data-pb-slide="${i}" aria-label="Go to slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}></button>`,
      )
      .join("");
    show(0);
  }

  function show(i) {
    const total = track.children.length;
    if (!total) return;
    index = ((i % total) + total) % total;
    track.style.transform = `translateX(-${index * 100}%)`;
    Array.from(track.children).forEach((s, n) => s.classList.toggle("is-active", n === index));
    Array.from(dotsHost.children).forEach((d, n) => {
      d.classList.toggle("is-active", n === index);
      if (n === index) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    });
    if (status) {
      const label = track.children[index].getAttribute("aria-label") || `Slide ${index + 1}`;
      status.textContent = `Slide ${index + 1} of ${total}: ${label}`;
    }
  }

  function next() { show(index + 1); }
  function prev() { show(index - 1); }
  function start() {
    if (reduced || timer || track.children.length < 2) return;
    timer = setInterval(next, 6000);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  nextBtn && nextBtn.addEventListener("click", () => { stop(); next(); start(); });
  prevBtn && prevBtn.addEventListener("click", () => { stop(); prev(); start(); });
  dotsHost.addEventListener("click", (e) => {
    const dot = e.target.closest("[data-pb-slide]");
    if (!dot) return;
    stop();
    show(Number(dot.getAttribute("data-pb-slide")));
    start();
  });

  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", (e) => {
    if (!root.contains(e.relatedTarget)) start();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  let touchX = null;
  root.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) { stop(); dx < 0 ? next() : prev(); start(); }
    touchX = null;
  }, { passive: true });

  async function load() {
    try {
      const snap = await getDocs(limit(collection(db, "products"), 8));
      products = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.status !== "rejected" && p.status !== "inactive")
        .slice(0, 5);
    } catch (err) {
      console.warn("Hero product load failed:", err);
    }
    render();
    start();
  }

  window.PaperBagHero = {
    setProducts(list) {
      if (!Array.isArray(list) || !list.length) return;
      products = list.slice(0, 5);
      render();
      start();
    },
  };

  // Render the payday slide immediately; enrich with products when available.
  render();
  load();
})();
