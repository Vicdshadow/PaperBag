// PaperBag — instant hybrid assistant.
// Answers common questions locally (instant), then optionally asks the
// server-side Gemini helper via the `replyWithAI` callable function.
import { functions, httpsCallable } from "./firebase-config.js";

(function () {
  "use strict";
  if (document.querySelector(".pb-chat-panel")) return;

  const KB = [
    {
      re: /(ship|deliver|delivery|how long|arrive|eta|track|tracking)/i,
      a: "We deliver nationwide across Nigeria. Most orders arrive in 2–5 working days, and you can follow your parcel from Orders → Track Order once it has been dispatched. Delivery fees are shown at checkout before you pay.",
    },
    {
      re: /(return|refund|exchange|damaged|wrong item|faulty)/i,
      a: "If something isn't right, you can request a return within 7 days of delivery. Open Orders → select the item → Request Return. Once our team confirms it, your refund is processed back to your original payment method.",
    },
    {
      re: /(pay|payment|checkout|bank transfer|paystack|opay|card)/i,
      a: "PaperBag uses direct, secure payments. Choose your provider at checkout (card or bank transfer details are displayed there). Your order moves to processing as soon as your payment is verified.",
    },
    {
      re: /(wishlist|save item|favourite|favorite|heart)/i,
      a: "Tap the heart on any product to save it to your wishlist. You can view everything you've saved from the heart icon in the header or from Account → Wishlist. Your list follows you across devices once you sign in.",
    },
    {
      re: /(cart|add to cart|buy|purchase|order)/i,
      a: "Add items to your cart, then tap the bag icon to review and check out. You can continue as a guest or sign in first — signing in keeps your cart and wishlist synced.",
    },
    {
      re: /(seller|sell on|become a seller|payout|commission|vendor|store)/i,
      a: "To sell on PaperBag, open the Seller Portal and complete registration with your business details and KYC. Once approved, you can upload products and manage orders. Payouts are processed to the account in your seller wallet.",
    },
    {
      re: /(login|log in|sign in|sign up|register|password|forgot|verif)/i,
      a: "Sign in with your email and password on the Login page. If you forgot your password, use 'Forgot password?' and we'll email you a reset link. New here? Choose Create Account.",
    },
    {
      re: /(price|discount|promo|cheap|offer|deal|sale|payday)/i,
      a: "We run regular deals — check the product slideshow at the top of the homepage and the Flash Sales row for current offers. Prices are set by our verified sellers, and any discount is shown on the product page.",
    },
    {
      re: /(original|genuine|authentic|fake|quality|warrant)/i,
      a: "PaperBag works with verified sellers and reviews products before they go live. Check the seller name and product photos on the listing, and contact us from Live Chat if anything looks off.",
    },
    {
      re: /(human|agent|person|support team|complain|speak|talk to)/i,
      a: "I can connect you with a person. Open the full Live Chat window using the button below and start a conversation — our support team will pick it up there.",
    },
    {
      re: /(hello|hi|hey|good morning|good afternoon|good evening)/i,
      a: "Hello! 👋 I'm the PaperBag assistant. I can help with orders, delivery, returns, payments, products and sellers. What would you like to know?",
    },
  ];

  const FALLBACK =
    "I'm not fully sure about that one yet. Try one of the suggested questions below, or open Live Chat to speak with our support team.";

  const QUICK = [
    "Where is my order?",
    "How do returns work?",
    "How do payments work?",
    "Talk to a human",
  ];

  let open = false;
  let busy = false;

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "pb-chat-fab";
  fab.setAttribute("aria-label", "Open PaperBag assistant");
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = '<i class="fas fa-comment-dots" aria-hidden="true"></i><span class="pb-fab-dot" aria-hidden="true"></span>';

  const panel = document.createElement("section");
  panel.className = "pb-chat-panel";
  panel.setAttribute("aria-label", "PaperBag assistant chat");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.innerHTML = `
    <header class="pb-chat-head">
      <div class="pb-chat-avatar"><i class="fas fa-bag-shopping" aria-hidden="true"></i></div>
      <div class="pb-chat-head-text">
        <strong>PaperBag Assistant</strong>
        <span><i class="pb-chat-online" aria-hidden="true"></i> Online now · instant answers</span>
      </div>
      <button type="button" class="pb-chat-close" aria-label="Close assistant"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </header>
    <div class="pb-chat-body" id="pbChatBody" aria-live="polite">
      <div class="pb-chat-msg pb-chat-msg--bot">
        <span class="pb-chat-badge"><i class="fas fa-bolt" aria-hidden="true"></i> Instant help</span>
        <div class="pb-chat-bubble">Hi! I'm the PaperBag assistant. Ask me about orders, delivery, returns or payments — I answer straight away.</div>
        <span class="pb-chat-time">Just now</span>
      </div>
    </div>
    <div class="pb-chat-quick" id="pbChatQuick"></div>
    <form class="pb-chat-form" id="pbChatForm">
      <input class="pb-chat-input" id="pbChatInput" type="text" autocomplete="off"
             placeholder="Type your question…" aria-label="Your message" />
      <button class="pb-chat-send" type="submit" aria-label="Send message"><i class="fas fa-paper-plane" aria-hidden="true"></i></button>
    </form>
    <div class="pb-chat-foot"><a href="chat.html">Open full Live Chat →</a></div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const body = panel.querySelector("#pbChatBody");
  const quick = panel.querySelector("#pbChatQuick");
  const form = panel.querySelector("#pbChatForm");
  const input = panel.querySelector("#pbChatInput");
  const closeBtn = panel.querySelector(".pb-chat-close");

  QUICK.forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pb-chat-chip";
    b.textContent = q;
    quick.appendChild(b);
  });

  function time() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function addMessage(text, who, badge) {
    const wrap = document.createElement("div");
    wrap.className = "pb-chat-msg pb-chat-msg--" + who;
    if (badge) {
      const b = document.createElement("span");
      b.className = "pb-chat-badge";
      b.innerHTML = badge;
      wrap.appendChild(b);
    }
    const bubble = document.createElement("div");
    bubble.className = "pb-chat-bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    const t = document.createElement("span");
    t.className = "pb-chat-time";
    t.textContent = time();
    wrap.appendChild(t);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function showTyping() {
    const el = document.createElement("div");
    el.className = "pb-chat-msg pb-chat-msg--bot";
    el.innerHTML =
      '<span class="pb-chat-badge"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Thinking</span>' +
      '<div class="pb-chat-bubble pb-chat-typing"><i></i><i></i><i></i></div>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function localAnswer(text) {
    for (let i = 0; i < KB.length; i++) {
      if (KB[i].re.test(text)) return KB[i].a;
    }
    return null;
  }

  async function aiAnswer(text) {
    try {
      const call = httpsCallable(functions, "replyWithAI");
      const res = await call({ message: text });
      return res && res.data && res.data.reply ? String(res.data.reply) : null;
    } catch (e) {
      return null;
    }
  }

  async function respond(text) {
    if (busy) return;
    busy = true;
    const instant = localAnswer(text);
    if (instant) {
      addMessage(instant, "bot", '<i class="fas fa-bolt" aria-hidden="true"></i> Instant answer');
      busy = false;
      return;
    }
    const typing = showTyping();
    const ai = await aiAnswer(text);
    typing.remove();
    addMessage(
      ai || FALLBACK,
      "bot",
      ai
        ? '<i class="fas fa-star" aria-hidden="true"></i> AI assistant'
        : '<i class="fas fa-circle-info" aria-hidden="true"></i> PaperBag',
    );
    busy = false;
  }

  function send(text) {
    const value = (text || input.value || "").trim();
    if (!value) return;
    addMessage(value, "user");
    input.value = "";
    respond(value);
  }

  function setOpen(next) {
    open = next;
    panel.classList.toggle("is-open", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    fab.innerHTML = open
      ? '<i class="fas fa-xmark" aria-hidden="true"></i>'
      : '<i class="fas fa-comment-dots" aria-hidden="true"></i><span class="pb-fab-dot" aria-hidden="true"></span>';
    if (open) setTimeout(() => input.focus(), 120);
  }

  fab.addEventListener("click", () => setOpen(!open));
  const askBtn = document.getElementById("pbAskAssistant");
  if (askBtn) askBtn.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });
  quick.addEventListener("click", (e) => {
    const chip = e.target.closest(".pb-chat-chip");
    if (!chip) return;
    const q = chip.textContent;
    if (/human|agent|person|talk/i.test(q)) {
      window.location.href = "chat.html";
      return;
    }
    send(q);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setOpen(false);
  });
})();
