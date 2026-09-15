/* ==========================================================================
   DV-MISSION APP - CORE LOGIC ENGINE (app.js)
   Handles UI Interactions, MediaRecorder, Polling, and Role-Based Logic
   ========================================================================== */

// DV Global Application State
const DV_STATE = {
  pin: "",
  name: "",          // NEW: needed to identify "self" when rendering bubbles
  role: "guest",
  micAllowed: true,
  lastSyncGroup: 0,
  lastSyncPrivate: 0,
  isRecording: false,
  recordTarget: null,
  pollTimer: null
};

// DV MediaRecorder Variables
let DV_MEDIA_RECORDER = null;
let DV_AUDIO_CHUNKS = [];
let DV_RECORD_TIMEOUT = null;

/* ==========================================================================
   DV INITIALIZATION & EVENT LISTENERS
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize Local Database
  dvInitDatabase(() => {
    dvLoadMessagesFromLocal("dv_group_chats", (msgs) => {
      msgs.forEach(m => dvRenderBubble(m, "group"));
      dvScrollChatToBottom("dv-group-msgs");
    });
    dvLoadMessagesFromLocal("dv_private_chats", (msgs) => {
      msgs.forEach(m => dvRenderBubble(m, "private"));
      dvScrollChatToBottom("dv-private-msgs");
    });
  });

  // 2. Setup Header & Sidebar Listeners
  document.getElementById("dv-btn-left-menu").addEventListener("click", () => dvToggleSidebar("dv-left-sidebar"));
  document.getElementById("dv-btn-right-menu").addEventListener("click", () => dvToggleSidebar("dv-right-sidebar"));
  document.getElementById("dv-sidebar-overlay").addEventListener("click", dvCloseSidebars);

  document.getElementById("dv-btn-exit-left").addEventListener("click", dvCloseSidebars);
  document.getElementById("dv-btn-exit-right").addEventListener("click", dvCloseSidebars);

  // 3. Setup Bottom Navigation Logic
  document.querySelectorAll(".dv-nav-item").forEach(btn => {
    btn.addEventListener("click", (e) => dvSwitchTab(e.currentTarget));
  });

  // 4. Setup Modal Triggers
  document.querySelectorAll("[data-modal]").forEach(item => {
    item.addEventListener("click", (e) => dvOpenEdgeModal(e.currentTarget.getAttribute("data-modal")));
  });
  document.getElementById("dv-btn-close-modal").addEventListener("click", dvCloseEdgeModal);

  // 5. Settings Controls
  document.getElementById("dv-btn-dark-mode").addEventListener("click", dvToggleTheme);
  document.getElementById("dv-font-slider").addEventListener("input", (e) => dvUpdateFontSize(e.target.value));

  // 6. Authentication & Action Buttons
  document.getElementById("dv-btn-login").addEventListener("click", dvVerifyPin);

  // Allow Enter key to submit PIN
  document.getElementById("dv-pin-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); dvVerifyPin(); }
  });

  // Group Chat Buttons
  document.getElementById("dv-group-send").addEventListener("click", () => dvSendTextMessage("group"));
  document.getElementById("dv-group-mic").addEventListener("click", () => dvToggleMicrophone("group"));
  document.getElementById("dv-group-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); dvSendTextMessage("group"); }
  });

  // Private Chat Buttons (Admin)
  document.getElementById("dv-private-send").addEventListener("click", () => dvSendTextMessage("private"));
  document.getElementById("dv-private-mic").addEventListener("click", () => dvToggleMicrophone("private"));
  document.getElementById("dv-private-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); dvSendTextMessage("private"); }
  });

  // Control Center
  document.getElementById("dv-btn-ticker").addEventListener("click", dvPushTicker);
});

/* ==========================================================================
   DV NOTIFICATION ENGINE
   ========================================================================== */

function dvShowLoader() {
  document.getElementById("dv-loader").classList.remove("dv-hidden");
}

function dvHideLoader() {
  document.getElementById("dv-loader").classList.add("dv-hidden");
}

function dvShowToast(message) {
  const toast = document.getElementById("dv-toast");
  document.getElementById("dv-toast-msg").textContent = message;
  toast.classList.remove("dv-hidden");
  clearTimeout(toast._dvTimer);
  toast._dvTimer = setTimeout(() => toast.classList.add("dv-hidden"), 3000);
}

function dvShowAlert(message) {
  const alertBox = document.getElementById("dv-alert");
  document.getElementById("dv-alert-msg").textContent = message;
  alertBox.classList.remove("dv-hidden");
  document.getElementById("dv-btn-close-alert").onclick = () => {
    alertBox.classList.add("dv-hidden");
  };
}

/* ==========================================================================
   DV UI NAVIGATION & MODALS
   ========================================================================== */

function dvSwitchTab(btnElement) {
  document.querySelectorAll(".dv-tab").forEach(tab => tab.classList.remove("dv-active-tab"));
  document.querySelectorAll(".dv-nav-item").forEach(nav => {
    nav.classList.remove("dv-active");
    nav.removeAttribute("aria-current");
  });

  const targetId = btnElement.getAttribute("data-target");
  document.getElementById(targetId).classList.add("dv-active-tab");
  btnElement.classList.add("dv-active");
  btnElement.setAttribute("aria-current", "page");
}

function dvToggleSidebar(sidebarId) {
  const overlay = document.getElementById("dv-sidebar-overlay");
  const sidebar = document.getElementById(sidebarId);

  // If already open, close
  if (sidebar.classList.contains("dv-open")) {
    dvCloseSidebars();
    return;
  }

  // Close both first, then open the requested one
  document.getElementById("dv-left-sidebar").classList.remove("dv-open");
  document.getElementById("dv-right-sidebar").classList.remove("dv-open");

  overlay.classList.add("dv-open");
  sidebar.classList.add("dv-open");
  sidebar.setAttribute("aria-hidden", "false");
}

function dvCloseSidebars() {
  const overlay = document.getElementById("dv-sidebar-overlay");
  const left = document.getElementById("dv-left-sidebar");
  const right = document.getElementById("dv-right-sidebar");

  overlay.classList.remove("dv-open");
  left.classList.remove("dv-open");
  right.classList.remove("dv-open");
  left.setAttribute("aria-hidden", "true");
  right.setAttribute("aria-hidden", "true");
}

function dvOpenEdgeModal(key) {
  if (!key) return;
  dvCloseSidebars();

  // Derive template ID from the key: "about-us" -> "tpl-about-us"
  const templateId = "tpl-" + key;
  const template = document.getElementById(templateId);

  if (!template) {
    // Fallback if template missing
    document.getElementById("dv-modal-title").textContent = key;
    document.getElementById("dv-modal-body").innerHTML = "";
    document.getElementById("dv-edge-modal").classList.add("dv-open");
    document.getElementById("dv-edge-modal").setAttribute("aria-hidden", "false");
    return;
  }

  // Clone template content
  const clone = template.content.cloneNode(true);

  // Derive title from the first heading inside the template
  const heading = template.content.querySelector(".dv-modal-heading");
  const title = heading ? heading.textContent : key;

  document.getElementById("dv-modal-title").textContent = title;

  const body = document.getElementById("dv-modal-body");
  body.innerHTML = "";
  body.appendChild(clone);

  const modal = document.getElementById("dv-edge-modal");
  modal.classList.add("dv-open");
  modal.setAttribute("aria-hidden", "false");
}

function dvCloseEdgeModal() {
  const modal = document.getElementById("dv-edge-modal");
  modal.classList.remove("dv-open");
  modal.setAttribute("aria-hidden", "true");
  // Clear body content after transition so next open starts clean
  setTimeout(() => {
    document.getElementById("dv-modal-body").innerHTML = "";
  }, 300);
}

function dvToggleTheme() {
  const isDark = document.body.classList.toggle("dv-dark-mode");
  try { localStorage.setItem("dv-theme", isDark ? "dark" : "light"); } catch (e) {}
  dvCloseSidebars();
}

function dvUpdateFontSize(size) {
  document.documentElement.style.setProperty("--dv-font-size", `${size}px`);
  try { localStorage.setItem("dv-font-size", size); } catch (e) {}
}

function dvScrollChatToBottom(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.scrollTop = el.scrollHeight;
}

/* ==========================================================================
   DV AUTHENTICATION & ROLE ROUTER
   ========================================================================== */

async function dvVerifyPin() {
  const pinInput = document.getElementById("dv-pin-input").value.trim();
  if (!pinInput) {
    dvShowToast("Access PIN is required.");
    return;
  }

  dvShowLoader();
  let response;
  try {
    response = await dvNetworkPost({ action: "syncState", pin: pinInput, lastSyncTime: 0 });
  } catch (err) {
    dvHideLoader();
    dvShowAlert("Cannot reach server. Check your connection.");
    return;
  }
  dvHideLoader();

  if (!response || !response.ok) {
    dvShowAlert((response && response.error) || "Authentication failed.");
    return;
  }

  DV_STATE.pin = pinInput;
  DV_STATE.role = response.role;
  DV_STATE.micAllowed = response.micEnabled;
  DV_STATE.name = response.name || (response.role === "admin" ? "Admin" : "User");

  // Swap Group Tab UI from PIN Entry to Chat UI
  document.getElementById("dv-pin-container").classList.add("dv-hidden");
  document.getElementById("dv-group-chat-ui").classList.remove("dv-hidden");

  // Dynamic Layout: Unhide Admin Tabs
  if (DV_STATE.role === "admin") {
    document.getElementById("dv-nav-chat").classList.remove("dv-hidden");
    document.getElementById("dv-nav-more").classList.remove("dv-hidden");
    document.getElementById("dv-tab-chat").classList.remove("dv-hidden");
    document.getElementById("dv-tab-more").classList.remove("dv-hidden");
  }

  dvShowToast("Access Granted.");
  dvStartPolling();
}

/* ==========================================================================
   DV POLLING & CHAT RENDERING
   ========================================================================== */

function dvStartPolling() {
  if (DV_STATE.pollTimer) clearInterval(DV_STATE.pollTimer);

  DV_STATE.pollTimer = setInterval(async () => {
    let res;
    try {
      res = await dvNetworkPost({
        action: "syncState",
        pin: DV_STATE.pin,
        lastSyncTime: DV_STATE.lastSyncGroup,
        lastSyncPrivate: DV_STATE.lastSyncPrivate
      });
    } catch (err) {
      return; // silent on network failure; next tick retries
    }

    if (!res || !res.ok) return;

    if (res.ticker) {
      document.getElementById("dv-live-ticker-display").textContent = res.ticker;
    }

    if (res.publicMessages && res.publicMessages.length) {
      res.publicMessages.forEach(msg => {
        if (msg.time > DV_STATE.lastSyncGroup) {
          dvRenderBubble(msg, "group");
          dvSaveMessageToLocal("dv_group_chats", msg);
          DV_STATE.lastSyncGroup = msg.time;
        }
      });
    }

    if (res.privateMessages && DV_STATE.role === "admin" && res.privateMessages.length) {
      res.privateMessages.forEach(msg => {
        if (msg.time > DV_STATE.lastSyncPrivate) {
          dvRenderBubble(msg, "private");
          dvSaveMessageToLocal("dv_private_chats", msg);
          DV_STATE.lastSyncPrivate = msg.time;
        }
      });
    }
  }, 3000);
}

function dvRenderBubble(msg, roomType) {
  const containerId = roomType === "group" ? "dv-group-msgs" : "dv-private-msgs";
  const container = document.getElementById(containerId);

  if (document.getElementById(`dv-msg-${msg.id}`)) return;

  // Correct self-detection: compare sender to the authenticated user's own name
  const isSelf = msg.sender === DV_STATE.name;

  const row = document.createElement("div");
  row.id = `dv-msg-${msg.id}`;
  row.className = `dv-msg-row ${isSelf ? "dv-msg-out" : "dv-msg-in"}`;

  const bubble = document.createElement("div");
  bubble.className = "dv-bubble";

  const senderEl = document.createElement("div");
  senderEl.className = "dv-sender-name";
  senderEl.textContent = msg.sender;
  bubble.appendChild(senderEl);

  const textEl = document.createElement("div");
  textEl.className = "dv-msg-text";

  if (msg.type === "AUDIO") {
    // Build audio player with event listener (not inline onclick)
    const player = document.createElement("div");
    player.className = "dv-audio-player";

    const playBtn = document.createElement("button");
    playBtn.className = "dv-audio-play-btn";
    playBtn.setAttribute("aria-label", "Play voice note");
    playBtn.innerHTML = '<svg class="dv-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    playBtn.addEventListener("click", () => dvPlayAudio(msg.content));
    player.appendChild(playBtn);

    const label = document.createElement("span");
    label.style.fontSize = "14px";
    label.textContent = "Voice Note";
    player.appendChild(label);

    textEl.appendChild(player);
  } else {
    // Use textContent to prevent XSS from message content
    textEl.textContent = msg.content;
  }

  bubble.appendChild(textEl);
  row.appendChild(bubble);
  container.appendChild(row);

  container.scrollTop = container.scrollHeight;
}

/* ==========================================================================
   DV MESSAGING (TEXT & AUDIO)
   ========================================================================== */

async function dvSendTextMessage(roomType) {
  const inputEl = document.getElementById(`dv-${roomType}-input`);
  const text = inputEl.value.trim();

  if (!text) return;
  if (text.length > 2500) {
    dvShowToast("Message too long (2500 character limit).");
    return;
  }

  dvShowLoader();
  let res;
  try {
    res = await dvNetworkPost({
      action: "sendMessage",
      pin: DV_STATE.pin,
      text: text,
      isPrivate: (roomType === "private")
    });
  } catch (err) {
    dvHideLoader();
    dvShowToast("Message failed to send. Check connection.");
    return;
  }
  dvHideLoader();

  if (res && res.ok) {
    inputEl.value = ""; // Clear ONLY on success
  } else {
    dvShowToast((res && res.error) || "Message failed to send.");
  }
}

async function dvToggleMicrophone(roomType) {
  if (!DV_STATE.micAllowed) {
    dvShowAlert("Your microphone privileges have been disabled by the Administrator.");
    return;
  }

  if (DV_STATE.isRecording && DV_STATE.recordTarget === roomType) {
    dvStopRecording();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    DV_STATE.recordTarget = roomType;
    DV_STATE.isRecording = true;
    DV_AUDIO_CHUNKS = [];

    DV_MEDIA_RECORDER = new MediaRecorder(stream);

    DV_MEDIA_RECORDER.ondataavailable = e => {
      if (e.data.size > 0) DV_AUDIO_CHUNKS.push(e.data);
    };

    DV_MEDIA_RECORDER.onstop = () => dvProcessAndUploadAudio(roomType);

    const micBtn = document.getElementById(`dv-${roomType}-mic`);
    micBtn.classList.add("dv-recording");

    DV_MEDIA_RECORDER.start();

    DV_RECORD_TIMEOUT = setTimeout(() => {
      if (DV_STATE.isRecording) {
        dvShowToast("10 second limit reached.");
        dvStopRecording();
      }
    }, 10000);

  } catch (err) {
    dvShowAlert("Microphone permission denied. Please allow access in your browser settings.");
  }
}

function dvStopRecording() {
  if (DV_MEDIA_RECORDER && DV_MEDIA_RECORDER.state !== "inactive") {
    DV_MEDIA_RECORDER.stop();
    DV_MEDIA_RECORDER.stream.getTracks().forEach(track => track.stop());
  }

  clearTimeout(DV_RECORD_TIMEOUT);
  DV_STATE.isRecording = false;

  const micBtn = document.getElementById(`dv-${DV_STATE.recordTarget}-mic`);
  if (micBtn) micBtn.classList.remove("dv-recording");
}

function dvProcessAndUploadAudio(roomType) {
  const blob = new Blob(DV_AUDIO_CHUNKS, { type: 'audio/webm' });

  // Size guard — backend caps at 3MB base64, ~2.2MB raw
  if (blob.size > 2000000) {
    dvShowToast("Recording too large. Try a shorter clip.");
    return;
  }

  const reader = new FileReader();

  reader.readAsDataURL(blob);
  reader.onloadend = async () => {
    dvShowLoader();
    let res;
    try {
      res = await dvNetworkPost({
        action: "sendAudio",
        pin: DV_STATE.pin,
        audioBase64: reader.result,
        isPrivate: (roomType === "private")
      });
    } catch (err) {
      dvHideLoader();
      dvShowToast("Voice note failed to send.");
      return;
    }
    dvHideLoader();

    if (!res || !res.ok) {
      dvShowToast((res && res.error) || "Voice note failed to send.");
    }
  };
}

async function dvPlayAudio(audioId) {
  dvShowLoader();
  let res;
  try {
    res = await dvNetworkPost({
      action: "getAudio",
      pin: DV_STATE.pin,
      audioId: audioId
    });
  } catch (err) {
    dvHideLoader();
    dvShowAlert("Could not reach server for audio.");
    return;
  }
  dvHideLoader();

  if (res && res.ok && res.audioBase64) {
    const audio = new Audio(res.audioBase64);
    audio.play().catch(() => dvShowAlert("Playback failed."));
  } else {
    dvShowAlert("Audio file could not be retrieved or has been deleted.");
  }
}

/* ==========================================================================
   DV ADMIN CONTROLS
   ========================================================================== */

async function dvPushTicker() {
  if (DV_STATE.role !== "admin") {
    dvShowAlert("Admin privileges required.");
    return;
  }

  const tickerInput = document.getElementById("dv-ticker-input").value.trim();
  if (!tickerInput) return dvShowToast("Ticker cannot be empty.");

  dvShowLoader();
  let res;
  try {
    res = await dvNetworkPost({
      action: "adminUpdateTicker",
      pin: DV_STATE.pin,
      ticker: tickerInput
    });
  } catch (err) {
    dvHideLoader();
    dvShowToast("Ticker update failed.");
    return;
  }
  dvHideLoader();

  if (res && res.ok) {
    dvShowToast("Ticker updated successfully.");
    document.getElementById("dv-ticker-input").value = "";
  } else {
    dvShowAlert((res && res.error) || "Ticker update failed.");
  }
}