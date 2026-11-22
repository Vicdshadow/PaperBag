// chat.js
import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  SELLER_EMAIL,
  storage,
  arrayUnion,
} from "./firebase-config.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// DOM Elements
const conversationList = document.getElementById("conversationList");
const messagesArea = document.getElementById("messagesArea");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");
const emptyChatState = document.getElementById("emptyChatState");
const activeChat = document.getElementById("activeChat");
const chatRecipientName = document.getElementById("chatRecipientName");
const chatRecipientStatus = document.getElementById("chatRecipientStatus");
const newChatBtn = document.getElementById("newChatBtn");
const startChatBtn = document.getElementById("startChatBtn");
const newChatModal = document.getElementById("newChatModal");
const closeChatModal = document.getElementById("closeChatModal");
const chatWithAdminBtn = document.getElementById("chatWithAdminBtn");
const searchConversations = document.getElementById("searchConversations");
const typingIndicator = document.getElementById("typingIndicator");
const closeChatBtn = document.getElementById("closeChatBtn");
const fileInput = document.getElementById("fileInput");

// State
let currentUser = null;
let currentConversationId = null;
let conversations = [];
let unsubscribeMessages = null;
let unsubscribeConversation = null;
let unsubscribeRecipientStatus = null;
let typingTimeout = null;
let isTyping = false;

// Initialize
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  updateOnlineStatus(true);
  initializeChat();

  // Set offline on unload
  window.addEventListener("beforeunload", () => updateOnlineStatus(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      updateOnlineStatus(false);
    } else {
      updateOnlineStatus(true);
    }
  });
});

async function updateOnlineStatus(isOnline) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      isOnline: isOnline,
      lastSeen: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error updating online status:", error);
  }
}

function initializeChat() {
  loadConversations();
  setupEventListeners();
  checkUrlParams();

  // Request notification permission
  if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
  }
}

// Check URL parameters for direct chat links
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const chatType = urlParams.get("type");
  const sellerId = urlParams.get("sellerId");
  const sellerName = urlParams.get("sellerName");
  const convId = urlParams.get("convId");

  if (convId) {
    selectConversation(convId);
  } else if (chatType === "admin") {
    startAdminChat();
  } else if (chatType === "seller" && sellerId) {
    startSellerChat(sellerId, sellerName || "Seller");
  }
}

// Setup Event Listeners
function setupEventListeners() {
  sendMessageBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener("input", () => {
    autoResizeTextarea();
    handleTyping();
  });

  fileInput.addEventListener("change", handleFileUpload);

  newChatBtn.addEventListener("click", () => {
    newChatModal.style.display = "flex";
  });

  startChatBtn.addEventListener("click", () => {
    newChatModal.style.display = "flex";
  });

  closeChatModal.addEventListener("click", () => {
    newChatModal.style.display = "none";
  });

  chatWithAdminBtn.addEventListener("click", () => {
    newChatModal.style.display = "none";
    startAdminChat();
  });

  searchConversations.addEventListener("input", filterConversations);

  if (closeChatBtn) {
    closeChatBtn.addEventListener("click", () => {
      activeChat.style.display = "none";
      emptyChatState.style.display = "flex";
      document
        .querySelector(".conversations-sidebar")
        .classList.remove("hidden");
    });
  }
}

// Show Notification
function showNotification(message) {
  if (Notification.permission === "granted") {
    const text =
      message.type === "image"
        ? "Sent an image"
        : message.type === "file"
          ? "Sent a file"
          : message.text;
    new Notification(`New message from ${message.senderName}`, {
      body: text,
    });
  }
}

// Reaction Functions
window.toggleReactionPicker = function (messageId) {
  const picker = document.getElementById(`reaction-picker-${messageId}`);
  if (picker) {
    const isVisible = picker.style.display !== "none";
    // Hide all other pickers
    document
      .querySelectorAll(".reaction-picker")
      .forEach((p) => (p.style.display = "none"));
    // Toggle current
    picker.style.display = isVisible ? "none" : "block";
  }
};

window.reactToMessage = async function (messageId, emoji) {
  if (!currentConversationId || !currentUser) return;
  try {
    const messageRef = doc(
      db,
      "conversations",
      currentConversationId,
      "messages",
      messageId,
    );
    // Optimistic update (UI will update via onSnapshot)
    await updateDoc(messageRef, {
      [`reactions.${currentUser.uid}`]: emoji,
    });
    // Hide picker
    document.getElementById(`reaction-picker-${messageId}`).style.display =
      "none";
  } catch (error) {
    console.error("Error reacting to message:", error);
  }
};

window.exportChat = async function () {
  if (!currentConversationId) return;
  try {
    const q = query(
      collection(db, "conversations", currentConversationId, "messages"),
      orderBy("timestamp", "asc"),
    );
    const snapshot = await getDocs(q);
    let content = "Chat Export\n\n";

    snapshot.forEach((doc) => {
      const msg = doc.data();
      const time = msg.timestamp
        ? new Date(msg.timestamp.toDate()).toLocaleString()
        : "";
      content += `[${time}] ${msg.senderName}: ${msg.text || (msg.type === "image" ? "[Image]" : "[File]")}\n`;
    });

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_export_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    document.getElementById("chatOptionsDropdown").style.display = "none";
  } catch (error) {
    console.error("Error exporting chat:", error);
    alert("Failed to export chat.");
  }
};

window.blockUser = async function () {
  if (!confirm("Are you sure you want to block this user?")) return;
  if (!currentUser || !currentConversationId) return;

  try {
    // Get conversation to find other user
    const convDoc = await getDoc(
      doc(db, "conversations", currentConversationId),
    );
    const otherUserId = convDoc
      .data()
      .participants.find((id) => id !== currentUser.uid);

    await updateDoc(doc(db, "users", currentUser.uid), {
      blockedUsers: arrayUnion(otherUserId),
    });

    alert("User blocked.");
    document.getElementById("chatOptionsDropdown").style.display = "none";
    // Ideally reload or update UI
  } catch (error) {
    console.error("Error blocking user:", error);
    // If arrayUnion is not imported, we might fail here.
    // Fallback: get doc, update array manually
  }
};

window.reportUser = function () {
  const reason = prompt("Please enter the reason for reporting this user:");
  if (reason) {
    // In a real app, send to admin collection
    console.log("Reported:", reason);
    alert("User reported. Thank you.");
    document.getElementById("chatOptionsDropdown").style.display = "none";
  }
};

// Handle Typing
async function handleTyping() {
  if (!currentConversationId) return;

  if (!isTyping) {
    isTyping = true;
    try {
      await updateDoc(doc(db, "conversations", currentConversationId), {
        [`typing.${currentUser.uid}`]: true,
      });
    } catch (e) {
      console.error("Error updating typing status:", e);
    }
  }

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(async () => {
    isTyping = false;
    try {
      await updateDoc(doc(db, "conversations", currentConversationId), {
        [`typing.${currentUser.uid}`]: false,
      });
    } catch (e) {
      console.error("Error clearing typing status:", e);
    }
  }, 2000);
}

// Handle File Upload
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file || !currentConversationId) return;

  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert("File size must be less than 5MB");
    return;
  }

  try {
    const storageRef = ref(
      storage,
      `chat_attachments/${currentConversationId}/${Date.now()}_${file.name}`,
    );
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    let type = "file";
    if (file.type.startsWith("image/")) {
      type = "image";
    }

    await sendMessage(null, type, { url: downloadURL, name: file.name });
    fileInput.value = "";
  } catch (error) {
    console.error("Error uploading file:", error);
    alert("Failed to upload file. Please try again.");
  }
}

// Auto-resize textarea
function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
}

// Load Conversations
function loadConversations() {
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", currentUser.uid),
    orderBy("updatedAt", "desc"),
  );

  onSnapshot(q, async (snapshot) => {
    conversations = [];
    conversationList.innerHTML = "";

    if (snapshot.empty) {
      conversationList.innerHTML = `
        <div class="loading-conversations">
          <i class="fas fa-inbox"></i>
          <p>No conversations yet</p>
          <button class="btn-primary" style="margin-top: 15px;" onclick="document.getElementById('newChatModal').style.display='flex'">
            Start a Chat
          </button>
        </div>
      `;
      return;
    }

    for (const docSnap of snapshot.docs) {
      const conv = { id: docSnap.id, ...docSnap.data() };
      conversations.push(conv);
      renderConversationItem(conv);
    }
  });
}

// Render Conversation Item
function renderConversationItem(conv) {
  const otherUserId = conv.participants.find((id) => id !== currentUser.uid);
  const recipientName = conv.participantNames?.[otherUserId] || "User";
  const recipientRole = conv.participantRoles?.[otherUserId] || "user";
  const unreadCount = conv.unreadCount?.[currentUser.uid] || 0;

  const lastMessageTime = conv.lastMessageTime
    ? formatTime(conv.lastMessageTime.toDate())
    : "";

  const div = document.createElement("div");
  div.className = `conversation-item ${currentConversationId === conv.id ? "active" : ""}`;
  div.onclick = () => openConversation(conv.id);

  let iconClass = "fa-user";
  if (recipientRole === "admin" || conv.type === "admin") {
    iconClass = "fa-headset";
  } else if (recipientRole === "seller" || conv.type === "seller") {
    iconClass = "fa-store";
  }

  div.innerHTML = `
    <div class="avatar">
      <i class="fas ${iconClass}"></i>
    </div>
    <div class="conversation-details">
      <div class="conversation-header">
        <span class="conversation-name">${recipientName}</span>
        <span class="conversation-time">${lastMessageTime}</span>
      </div>
      <div style="display: flex; align-items: center;">
        <div class="conversation-preview" style="flex: 1;">${conv.lastMessage || "No messages yet"}</div>
        ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ""}
      </div>
    </div>
  `;

  conversationList.appendChild(div);
}

// Format Time
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// Filter Conversations
function filterConversations() {
  const searchTerm = searchConversations.value.toLowerCase();
  const items = conversationList.querySelectorAll(".conversation-item");

  items.forEach((item) => {
    const name = item
      .querySelector(".conversation-name")
      .textContent.toLowerCase();
    const preview = item
      .querySelector(".conversation-preview")
      .textContent.toLowerCase();

    if (name.includes(searchTerm) || preview.includes(searchTerm)) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

// Start Admin Chat
async function startAdminChat() {
  try {
    // Check if conversation already exists
    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", currentUser.uid),
      where("type", "==", "admin"),
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // Open existing conversation
      openConversation(snapshot.docs[0].id);
      return;
    }

    // Get current user data
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const userName = userData.fullName || currentUser.email;

    // Create new conversation
    const conversationData = {
      type: "admin",
      participants: [currentUser.uid, "admin"],
      participantNames: {
        [currentUser.uid]: userName,
        admin: "Support",
      },
      participantRoles: {
        [currentUser.uid]: userData.role || "buyer",
        admin: "admin",
      },
      lastMessage: "",
      lastMessageTime: serverTimestamp(),
      unreadCount: {
        [currentUser.uid]: 0,
        admin: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(
      collection(db, "conversations"),
      conversationData,
    );
    openConversation(docRef.id);
  } catch (error) {
    console.error("Error starting admin chat:", error);
    alert("Failed to start chat. Please try again.");
  }
}

// Start Seller Chat
async function startSellerChat(sellerId, sellerName) {
  try {
    // Check if conversation already exists
    const q = query(
      collection(db, "conversations"),
      where("participants", "array-contains", currentUser.uid),
      where("sellerId", "==", sellerId),
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      openConversation(snapshot.docs[0].id);
      return;
    }

    // Get current user data
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const userName = userData.fullName || currentUser.email;

    // Create new conversation
    const conversationData = {
      type: "seller",
      participants: [currentUser.uid, sellerId],
      participantNames: {
        [currentUser.uid]: userName,
        [sellerId]: sellerName,
      },
      participantRoles: {
        [currentUser.uid]: userData.role || "buyer",
        [sellerId]: "seller",
      },
      sellerId: sellerId,
      sellerName: sellerName,
      lastMessage: "",
      lastMessageTime: serverTimestamp(),
      unreadCount: {
        [currentUser.uid]: 0,
        [sellerId]: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(
      collection(db, "conversations"),
      conversationData,
    );
    openConversation(docRef.id);
  } catch (error) {
    console.error("Error starting seller chat:", error);
    alert("Failed to start chat. Please try again.");
  }
}

// Open Conversation
async function openConversation(conversationId) {
  currentConversationId = conversationId;

  // Update UI
  emptyChatState.style.display = "none";
  activeChat.style.display = "flex";

  // Hide sidebar on mobile
  if (window.innerWidth <= 768) {
    document.querySelector(".conversations-sidebar").classList.add("hidden");
  }

  // Update active state in conversation list
  document.querySelectorAll(".conversation-item").forEach((item) => {
    item.classList.remove("active");
  });
  event?.target?.closest(".conversation-item")?.classList.add("active");

  // Get conversation data
  const convDoc = await getDoc(doc(db, "conversations", conversationId));
  const convData = convDoc.data();

  // Update chat header
  const otherUserId = convData.participants.find(
    (id) => id !== currentUser.uid,
  );
  const recipientName = convData.participantNames?.[otherUserId] || "User";
  chatRecipientName.textContent = recipientName;

  // Mark messages as read
  await updateDoc(doc(db, "conversations", conversationId), {
    [`unreadCount.${currentUser.uid}`]: 0,
  });

  // Listen for typing status
  if (unsubscribeConversation) unsubscribeConversation();
  unsubscribeConversation = onSnapshot(
    doc(db, "conversations", conversationId),
    (docSnap) => {
      const data = docSnap.data();
      if (!data) return;
      const isOtherTyping = data.typing?.[otherUserId];
      if (isOtherTyping) {
        typingIndicator.style.display = "flex";
        messagesArea.scrollTop = messagesArea.scrollHeight;
      } else {
        typingIndicator.style.display = "none";
      }
    },
  );

  // Listen for online status
  if (unsubscribeRecipientStatus) unsubscribeRecipientStatus();
  if (otherUserId !== "admin") {
    unsubscribeRecipientStatus = onSnapshot(
      doc(db, "users", otherUserId),
      (docSnap) => {
        const data = docSnap.data();
        if (data?.isOnline) {
          chatRecipientStatus.textContent = "Online";
          chatRecipientStatus.classList.remove("offline");
        } else {
          chatRecipientStatus.textContent = data?.lastSeen
            ? "Last seen " + formatTime(data.lastSeen.toDate())
            : "Offline";
          chatRecipientStatus.classList.add("offline");
        }
      },
    );
  } else {
    chatRecipientStatus.textContent = "Support";
  }

  // Load messages
  loadMessages(conversationId);
}

// Load Messages
function loadMessages(conversationId) {
  // Unsubscribe from previous messages listener
  if (unsubscribeMessages) {
    unsubscribeMessages();
  }

  messagesArea.innerHTML = "";

  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("timestamp", "asc"),
  );

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const message = { id: change.doc.id, ...change.doc.data() };
        renderMessage(message);

        // Send notification if backgrounded
        if (
          !change.doc.metadata.hasPendingWrites &&
          document.visibilityState === "hidden" &&
          message.senderId !== currentUser.uid
        ) {
          showNotification(message);
        }
      }
      if (change.type === "modified") {
        // Update message (e.g. reactions)
        const message = { id: change.doc.id, ...change.doc.data() };
        const existingMsg = document.getElementById(`msg-${message.id}`);
        if (existingMsg) {
          existingMsg.outerHTML = createMessageHTML(message);
        }
      }
    });

    // Scroll to bottom
    scrollToBottom();
  });
}

// Create Message HTML
function createMessageHTML(message) {
  const isSent = message.senderId === currentUser.uid;
  const time = message.timestamp
    ? new Date(message.timestamp.toDate()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  let messageContent = "";
  if (message.type === "image") {
    messageContent = `<img src="${message.fileUrl}" alt="Image" style="max-width: 200px; border-radius: 8px; cursor: pointer;" onclick="window.open('${message.fileUrl}', '_blank')">`;
  } else if (message.type === "file") {
    messageContent = `
      <a href="${message.fileUrl}" target="_blank" class="file-attachment" style="display: flex; align-items: center; text-decoration: none; color: inherit; gap: 8px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 8px;">
        <i class="fas fa-file-alt" style="font-size: 24px;"></i>
        <div style="overflow: hidden;">
          <div style="font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(message.fileName || "File")}</div>
          <div style="font-size: 11px; opacity: 0.7;">Click to download</div>
        </div>
      </a>`;
  } else {
    messageContent = `<div class="message-text">${escapeHtml(message.text)}</div>`;
  }

  // Reactions
  const reactions = message.reactions || {};
  let reactionsHtml = "";
  if (Object.keys(reactions).length > 0) {
    const counts = {};
    Object.values(reactions).forEach((r) => (counts[r] = (counts[r] || 0) + 1));
    reactionsHtml = `
      <div class="message-reactions" style="display:flex; gap:4px; margin-top:4px; flex-wrap: wrap;">
        ${Object.entries(counts)
          .map(
            ([emoji, count]) =>
              `<span style="background:rgba(0,0,0,0.05); padding:2px 6px; border-radius:10px; font-size:12px;">${emoji} ${count > 1 ? count : ""}</span>`,
          )
          .join("")}
      </div>`;
  }

  return `
    <div id="msg-${message.id}" class="message ${isSent ? "sent" : "received"}" style="position: relative;">
      <div class="message-bubble group">
        ${!isSent ? `<div class="message-sender">${message.senderName || "User"}</div>` : ""}
        ${messageContent}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div class="message-time">${time}</div>
          <button class="btn-react" onclick="toggleReactionPicker('${message.id}')" style="background:none; border:none; color:#9a9aa2; cursor:pointer; font-size:14px; padding: 0 4px; opacity: 0.5; transition: opacity 0.2s;">
            <i class="far fa-smile"></i>
          </button>
        </div>
        ${reactionsHtml}
        
        <!-- Reaction Picker -->
        <div id="reaction-picker-${message.id}" class="reaction-picker" style="display: none; position: absolute; bottom: 100%; right: 0; background: white; border-radius: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 5px; z-index: 10; white-space: nowrap;">
          ${["👍", "❤️", "😂", "😮", "😢", "🔥"]
            .map(
              (emoji) =>
                `<button onclick="reactToMessage('${message.id}', '${emoji}')" style="background:none; border:none; font-size:18px; cursor:pointer; padding: 4px; transition: transform 0.2s;">${emoji}</button>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

// Render Message
function renderMessage(message) {
  const html = createMessageHTML(message);
  const div = document.createElement("div");
  div.innerHTML = html;
  messagesArea.appendChild(div.firstElementChild);
}

// Send Message
async function sendMessage(content = null, type = "text", fileData = null) {
  let text = content;
  if (type === "text" && !text) {
    text = messageInput.value.trim();
  }

  if ((!text && type === "text") || !currentConversationId) return;

  try {
    // Get current user data
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const userName = userData.fullName || currentUser.email;

    const messageData = {
      senderId: currentUser.uid,
      senderName: userName,
      timestamp: serverTimestamp(),
      read: false,
      type: type,
    };

    if (type === "text") {
      messageData.text = text;
    } else if (type === "image" || type === "file") {
      messageData.fileUrl = fileData.url;
      messageData.fileName = fileData.name;
      messageData.text = type === "image" ? "Sent an image" : "Sent a file"; // value for preview
    }

    // Add message to subcollection
    await addDoc(
      collection(db, "conversations", currentConversationId, "messages"),
      messageData,
    );

    // Update conversation
    const convDoc = await getDoc(
      doc(db, "conversations", currentConversationId),
    );
    const convData = convDoc.data();
    const otherUserId = convData.participants.find(
      (id) => id !== currentUser.uid,
    );

    await updateDoc(doc(db, "conversations", currentConversationId), {
      lastMessage:
        type === "text"
          ? text.substring(0, 50) + (text.length > 50 ? "..." : "")
          : messageData.text,
      lastMessageTime: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`unreadCount.${otherUserId}`]:
        (convData.unreadCount?.[otherUserId] || 0) + 1,
    });

    // Clear input
    messageInput.value = "";
    messageInput.style.height = "auto";
  } catch (error) {
    console.error("Error sending message:", error);
    alert("Failed to send message. Please try again.");
  }
}

// Scroll to Bottom
function scrollToBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Make functions globally accessible
window.startAdminChat = startAdminChat;
window.startSellerChat = startSellerChat;
