import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  SELLER_EMAIL,
  where,
} from "./firebase-config.js";

// DOM Elements
const totalChatsEl = document.getElementById("totalChats");
const unreadMessagesEl = document.getElementById("unreadMessages");
const adminChatsEl = document.getElementById("adminChats");
const sellerChatsEl = document.getElementById("sellerChats");
const adminChatList = document.getElementById("adminChatList");
const filterTabs = document.querySelectorAll(".filter-pill");
const logoutBtn = document.getElementById("logoutBtn");

// Active Chat Elements
const emptyAdminChatState = document.getElementById("emptyAdminChatState");
const activeAdminChat = document.getElementById("activeAdminChat");
const adminMessagesArea = document.getElementById("adminMessagesArea");
const adminMessageInput = document.getElementById("adminMessageInput");
const sendAdminMessageBtn = document.getElementById("sendAdminMessageBtn");
const adminChatRecipientName = document.getElementById(
  "adminChatRecipientName",
);
const adminChatRecipientStatus = document.getElementById(
  "adminChatRecipientStatus",
);
const closeAdminChat = document.getElementById("closeAdminChat");
const adminTypingIndicator = document.getElementById("adminTypingIndicator");
const adminFileInput = document.getElementById("adminFileInput");

// State
let currentUser = null;
let currentConversationId = null;
let allConversations = [];
let currentFilter = "all";
let unsubscribeMessages = null;
let unsubscribeConversation = null;
let unsubscribeRecipientStatus = null;
let typingTimeout = null;
let isTyping = false;

// Admin Check
async function requireAdmin(user) {
  if (!user) {
    window.location.href = "login.html";
    return false;
  }

  const ADMIN_EMAILS = [
    String(SELLER_EMAIL || "").toLowerCase(),
    "support@ekoast.com",
    "admin@ekoast.com",
    "ekoast047@gmail.com",
  ];
  const isMasterAdmin = ADMIN_EMAILS.includes(
    String(user.email || "").trim().toLowerCase(),
  );

  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    const userData = userDoc.data();

    if (
      !isMasterAdmin &&
      userData?.role !== "admin" &&
      userData?.role !== "sub-admin"
    ) {
      alert("Access Restricted");
      window.location.href = "index.html";
      return false;
    }
    return true;
  } catch (err) {
    console.error("Admin check failed:", err);
    if (isMasterAdmin) return true;
    window.location.href = "index.html";
    return false;
  }
}

// Initialize
onAuthStateChanged(auth, async (user) => {
  if (await requireAdmin(user)) {
    currentUser = user;
    const emailDisplay = document.getElementById("adminEmail");
    if (emailDisplay) emailDisplay.textContent = user.email;

    // Sub-admin sidebar restrictions
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const isSubAdmin = userDoc.data()?.role === "sub-admin";
    if (isSubAdmin) {
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        const text = btn.textContent.toLowerCase();
        if (
          !text.includes("chats") &&
          !text.includes("overview") &&
          !text.includes("reports")
        ) {
          btn.style.display = "none";
        }
      });
    }

    loadAllConversations();
    setupEventListeners();
  }
});

function setupEventListeners() {
  // Filters
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      renderConversations();
    });
  });

  // Messaging
  sendAdminMessageBtn.addEventListener("click", sendMessage);
  adminMessageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  adminMessageInput.addEventListener("input", handleTyping);

  closeAdminChat.addEventListener("click", () => {
    activeAdminChat.style.display = "none";
    emptyAdminChatState.style.display = "flex";
    currentConversationId = null;
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeConversation) unsubscribeConversation();
    if (unsubscribeRecipientStatus) unsubscribeRecipientStatus();
    renderConversations(); // Update active state in list
  });

  logoutBtn?.addEventListener("click", () => signOut(auth));
}

// Load All Conversations
function loadAllConversations() {
  const q = query(
    collection(db, "conversations"),
    orderBy("updatedAt", "desc"),
  );

  onSnapshot(q, (snapshot) => {
    allConversations = [];
    let totalUnread = 0;
    let adminChatCount = 0;
    let sellerChatCount = 0;

    snapshot.forEach((doc) => {
      const conv = { id: doc.id, ...doc.data() };
      allConversations.push(conv);

      if (conv.unreadCount?.admin) {
        totalUnread += conv.unreadCount.admin;
      }

      if (conv.type === "admin") adminChatCount++;
      else if (conv.type === "seller") sellerChatCount++;
    });

    totalChatsEl.textContent = allConversations.length;
    unreadMessagesEl.textContent = totalUnread;
    adminChatsEl.textContent = adminChatCount;
    sellerChatsEl.textContent = sellerChatCount;

    renderConversations();
  });
}

// Render Conversation List
function renderConversations() {
  adminChatList.innerHTML = "";

  let filtered = allConversations;
  if (currentFilter === "admin")
    filtered = allConversations.filter((c) => c.type === "admin");
  else if (currentFilter === "seller")
    filtered = allConversations.filter((c) => c.type === "seller");
  else if (currentFilter === "unread")
    filtered = allConversations.filter((c) => c.unreadCount?.admin > 0);

  if (filtered.length === 0) {
    adminChatList.innerHTML = `<div class="loading-conversations"><p>No conversations found</p></div>`;
    return;
  }

  filtered.forEach((conv) => {
    const div = document.createElement("div");
    div.className = `admin-chat-item ${currentConversationId === conv.id ? "active" : ""}`;
    div.onclick = () => selectConversation(conv.id);

    const otherUserId = conv.participants.find((id) => id !== "admin");
    const participants = conv.participantNames?.[otherUserId] || "User";
    const unreadCount = conv.unreadCount?.admin || 0;
    const lastTime = conv.lastMessageTime
      ? formatTime(conv.lastMessageTime.toDate())
      : "";

    div.innerHTML = `
      <div class="avatar">
        <i class="fas ${conv.type === "admin" ? "fa-headset" : "fa-store"}"></i>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong style="font-size: 13px;">${participants}</strong>
          <span style="font-size: 11px; color: #55555e;">${lastTime}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 12px; color: #55555e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">
            ${conv.lastMessage || "No messages"}
          </div>
          ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ""}
        </div>
        <span class="chat-type-badge ${conv.type}">${conv.type}</span>
      </div>
    `;
    adminChatList.appendChild(div);
  });
}

// Select and Open Conversation
async function selectConversation(convId) {
  if (currentConversationId === convId) return;
  currentConversationId = convId;

  // UI State
  emptyAdminChatState.style.display = "none";
  activeAdminChat.style.display = "flex";
  renderConversations(); // Refresh list to show active state

  const conv = allConversations.find((c) => c.id === convId);
  const otherUserId = conv.participants.find((id) => id !== "admin");
  adminChatRecipientName.textContent =
    conv.participantNames?.[otherUserId] || "User";

  // Mark as read
  await updateDoc(doc(db, "conversations", convId), { "unreadCount.admin": 0 });

  // Load Messages
  if (unsubscribeMessages) unsubscribeMessages();
  adminMessagesArea.innerHTML = "";
  const q = query(
    collection(db, "conversations", convId, "messages"),
    orderBy("timestamp", "asc"),
  );
  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added")
        renderMessage({ id: change.doc.id, ...change.doc.data() });
    });
    adminMessagesArea.scrollTop = adminMessagesArea.scrollHeight;
  });

  // Typing & Online Status listeners
  setupRealtimeListeners(convId, otherUserId);
}

function setupRealtimeListeners(convId, otherUserId) {
  if (unsubscribeConversation) unsubscribeConversation();
  unsubscribeConversation = onSnapshot(
    doc(db, "conversations", convId),
    (docSnap) => {
      const data = docSnap.data();
      adminTypingIndicator.style.display = data?.typing?.[otherUserId]
        ? "flex"
        : "none";
      if (data?.typing?.[otherUserId])
        adminMessagesArea.scrollTop = adminMessagesArea.scrollHeight;
    },
  );

  if (unsubscribeRecipientStatus) unsubscribeRecipientStatus();
  unsubscribeRecipientStatus = onSnapshot(
    doc(db, "users", otherUserId),
    (docSnap) => {
      const data = docSnap.data();
      const dot = activeAdminChat.querySelector(".status-dot");
      if (data?.isOnline) {
        adminChatRecipientStatus.textContent = "Online";
        dot.classList.add("online");
      } else {
        adminChatRecipientStatus.textContent = data?.lastSeen
          ? "Last seen " + formatTime(data.lastSeen.toDate())
          : "Offline";
        dot.classList.remove("online");
      }
    },
  );
}

function renderMessage(msg) {
  const isSent = msg.senderId === currentUser.uid || msg.senderId === "admin";
  const time = msg.timestamp
    ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const div = document.createElement("div");
  div.className = `message ${isSent ? "sent" : "received"}`;
  div.innerHTML = `
    <div class="message-bubble">
      ${!isSent ? `<div class="message-sender">${msg.senderName}</div>` : ""}
      <div class="message-text">${msg.text}</div>
      <div class="message-time">${time}</div>
    </div>
  `;
  adminMessagesArea.appendChild(div);
}

async function sendMessage() {
  const text = adminMessageInput.value.trim();
  if (!text || !currentConversationId) return;

  const conv = allConversations.find((c) => c.id === currentConversationId);
  const otherUserId = conv.participants.find((id) => id !== "admin");

  try {
    const msgData = {
      senderId: "admin",
      senderName: "Support",
      text,
      timestamp: serverTimestamp(),
      read: false,
      type: "text",
    };

    await addDoc(
      collection(db, "conversations", currentConversationId, "messages"),
      msgData,
    );
    await updateDoc(doc(db, "conversations", currentConversationId), {
      lastMessage: text,
      lastMessageTime: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`unreadCount.${otherUserId}`]:
        (conv.unreadCount?.[otherUserId] || 0) + 1,
    });

    adminMessageInput.value = "";
    adminMessageInput.style.height = "auto";
  } catch (err) {
    console.error("Error sending message:", err);
  }
}

async function handleTyping() {
  if (!currentConversationId || isTyping) return;
  isTyping = true;
  await updateDoc(doc(db, "conversations", currentConversationId), {
    "typing.admin": true,
  });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(async () => {
    isTyping = false;
    await updateDoc(doc(db, "conversations", currentConversationId), {
      "typing.admin": false,
    });
  }, 2000);
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return date.toLocaleDateString();
}

