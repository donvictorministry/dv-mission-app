/* ==========================================================================
   DV-MISSION APP - CORE LOGIC ENGINE (app.js)
   Handles UI Interactions, MediaRecorder, Polling, and Role-Based Logic
   ========================================================================== */

// DV Global Application State
const DV_STATE = {
  pin: "",
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
    dvLoadMessagesFromLocal("dv_group_chats", (msgs) => msgs.forEach(m => dvRenderBubble(m, "group")));
    dvLoadMessagesFromLocal("dv_private_chats", (msgs) => msgs.forEach(m => dvRenderBubble(m, "private")));
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

  // 4. Setup Modal Triggers (Data Attributes)
  document.querySelectorAll("[data-modal]").forEach(item => {
    item.addEventListener("click", (e) => dvOpenEdgeModal(e.currentTarget.getAttribute("data-modal")));
  });
  document.getElementById("dv-btn-close-modal").addEventListener("click", dvCloseEdgeModal);

  // 5. Settings Controls
  document.getElementById("dv-btn-dark-mode").addEventListener("click", dvToggleTheme);
  document.getElementById("dv-font-slider").addEventListener("input", (e) => dvUpdateFontSize(e.target.value));

  // 6. Authentication & Action Buttons
  document.getElementById("dv-btn-login").addEventListener("click", dvVerifyPin);
  
  // Group Chat Buttons
  document.getElementById("dv-group-send").addEventListener("click", () => dvSendTextMessage("group"));
  document.getElementById("dv-group-mic").addEventListener("click", () => dvToggleMicrophone("group"));
  
  // Private Chat Buttons (Admin)
  document.getElementById("dv-private-send").addEventListener("click", () => dvSendTextMessage("private"));
  document.getElementById("dv-private-mic").addEventListener("click", () => dvToggleMicrophone("private"));

  // Control Center
  document.getElementById("dv-btn-ticker").addEventListener("click", dvPushTicker);
});

/* ==========================================================================
   DV NOTIFICATION ENGINE (Strictly Centered, No Blur)
   ========================================================================== */

function dvShowLoader() {
  document.getElementById("dv-loader").classList.remove("dv-hidden");
}

function dvHideLoader() {
  document.getElementById("dv-loader").classList.add("dv-hidden");
}

function dvShowToast(message) {
  const toast = document.getElementById("dv-toast");
  document.getElementById("dv-toast-msg").innerText = message;
  toast.classList.remove("dv-hidden");
  setTimeout(() => toast.classList.add("dv-hidden"), 3000);
}

function dvShowAlert(message) {
  const alertBox = document.getElementById("dv-alert");
  document.getElementById("dv-alert-msg").innerText = message;
  alertBox.classList.remove("dv-hidden");
  
  document.getElementById("dv-btn-close-alert").onclick = () => {
    alertBox.classList.add("dv-hidden");
  };
}

/* ==========================================================================
   DV UI NAVIGATION & MODALS
   ========================================================================== */

function dvSwitchTab(btnElement) {
  // Hide all tabs
  document.querySelectorAll(".dv-tab").forEach(tab => tab.classList.remove("dv-active-tab"));
  document.querySelectorAll(".dv-nav-item").forEach(nav => nav.classList.remove("dv-active"));
  
  // Show target tab
  const targetId = btnElement.getAttribute("data-target");
  document.getElementById(targetId).classList.add("dv-active-tab");
  btnElement.classList.add("dv-active");
}

function dvToggleSidebar(sidebarId) {
  document.getElementById("dv-sidebar-overlay").style.display = "block";
  document.getElementById(sidebarId).classList.add("dv-open");
}

function dvCloseSidebars() {
  document.getElementById("dv-sidebar-overlay").style.display = "none";
  document.getElementById("dv-left-sidebar").classList.remove("dv-open");
  document.getElementById("dv-right-sidebar").classList.remove("dv-open");
}

function dvOpenEdgeModal(title) {
  dvCloseSidebars(); // Close sidebars if open
  document.getElementById("dv-modal-title").innerText = title;
  
  // Inject basic content based on title
  const body = document.getElementById("dv-modal-body");
  body.innerHTML = `
    <h2 style="color: var(--dv-primary); margin-bottom: 16px;">${title}</h2>
    <p>This is the official edge-to-edge content view for <strong>${title}</strong>.</p>
  `;
  
  document.getElementById("dv-edge-modal").classList.add("dv-open");
}

function dvCloseEdgeModal() {
  document.getElementById("dv-edge-modal").classList.remove("dv-open");
}

function dvToggleTheme() {
  document.body.classList.toggle("dv-dark-mode");
  dvCloseSidebars();
}

function dvUpdateFontSize(size) {
  document.documentElement.style.setProperty("--dv-font-size", `${size}px`);
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
  const response = await dvNetworkPost({ action: "syncState", pin: pinInput, lastSyncTime: 0 });
  dvHideLoader();

  if (!response.ok) {
    dvShowAlert(response.error);
    return;
  }

  // Auth Success - Update State
  DV_STATE.pin = pinInput;
  DV_STATE.role = response.role;
  DV_STATE.micAllowed = response.micEnabled;

  // Swap Group Tab UI from PIN Entry to Chat UI
  document.getElementById("dv-pin-container").classList.add("dv-hidden");
  document.getElementById("dv-group-chat-ui").classList.remove("dv-hidden");

  // Dynamic Layout: Unhide Admin Tabs if Applicable
  if (DV_STATE.role === "admin") {
    document.getElementById("dv-nav-chat").classList.remove("dv-hidden");
    document.getElementById("dv-nav-more").classList.remove("dv-hidden");
  }

  dvShowToast("Access Granted.");
  dvStartPolling();
}

/* ==========================================================================
   DV POLLING & CHAT RENDERING
   ========================================================================== */

function dvStartPolling() {
  if (DV_STATE.pollTimer) clearInterval(DV_STATE.pollTimer);
  
  // Poll every 3 seconds
  DV_STATE.pollTimer = setInterval(async () => {
    // We send the highest lastSync to get only new messages
    const syncTime = Math.max(DV_STATE.lastSyncGroup, DV_STATE.lastSyncPrivate);
    
    const res = await dvNetworkPost({ action: "syncState", pin: DV_STATE.pin, lastSyncTime: syncTime });
    
    if (res.ok) {
      // Process Ticker
      if (res.ticker) {
        document.getElementById("dv-live-ticker-display").innerText = res.ticker;
      }

      // Process Public Messages
      if (res.publicMessages) {
        res.publicMessages.forEach(msg => {
          if (msg.time > DV_STATE.lastSyncGroup) {
            dvRenderBubble(msg, "group");
            dvSaveMessageToLocal("dv_group_chats", msg);
            DV_STATE.lastSyncGroup = msg.time;
          }
        });
      }

      // Process Private Messages (Admin only)
      if (res.privateMessages && DV_STATE.role === "admin") {
        res.privateMessages.forEach(msg => {
          if (msg.time > DV_STATE.lastSyncPrivate) {
            dvRenderBubble(msg, "private");
            dvSaveMessageToLocal("dv_private_chats", msg);
            DV_STATE.lastSyncPrivate = msg.time;
          }
        });
      }
    }
  }, 3000);
}

function dvRenderBubble(msg, roomType) {
  const containerId = roomType === "group" ? "dv-group-msgs" : "dv-private-msgs";
  const container = document.getElementById(containerId);
  
  // Prevent duplicate rendering
  if (document.getElementById(`dv-msg-${msg.id}`)) return;

  // Determine if incoming or outgoing
  const isSelf = (DV_STATE.role === "admin" && msg.sender === "Admin") || 
                 (DV_STATE.role === "user" && msg.sender !== "Admin"); // Simplification for demo logic

  const row = document.createElement("div");
  row.id = `dv-msg-${msg.id}`;
  row.className = `dv-msg-row ${isSelf ? "dv-msg-out" : ""}`;

  let contentHtml = msg.content;

  // Render Inline Audio Player for AUDIO types
  if (msg.type === "AUDIO") {
    contentHtml = `
      <div class="dv-audio-player">
        <button class="dv-audio-play-btn" onclick="dvPlayAudio('${msg.content}')">
          <svg class="dv-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <span style="font-size: 14px;">Voice Note</span>
      </div>
    `;
  }

  row.innerHTML = `
    <div class="dv-bubble">
      <div class="dv-sender-name">${msg.sender}</div>
      <div class="dv-msg-text">${contentHtml}</div>
    </div>
  `;

  container.appendChild(row);
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/* ==========================================================================
   DV MESSAGING (TEXT & AUDIO)
   ========================================================================== */

async function dvSendTextMessage(roomType) {
  const inputEl = document.getElementById(`dv-${roomType}-input`);
  const text = inputEl.value.trim();
  
  if (!text) return;
  inputEl.value = ""; // Clear input immediately

  dvShowLoader();
  const res = await dvNetworkPost({ 
    action: "sendMessage", 
    pin: DV_STATE.pin,
    text: text,
    isPrivate: (roomType === "private") 
  });
  dvHideLoader();

  if (!res.ok) dvShowToast(res.error);
}

// MediaRecorder Logic (Strict 10s max)
async function dvToggleMicrophone(roomType) {
  if (!DV_STATE.micAllowed) {
    dvShowAlert("Your microphone privileges have been disabled by the Administrator.");
    return;
  }

  // If already recording, clicking again stops and sends
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

    // Strict 10-Second Cutoff
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
    // Stop all audio tracks to turn off the recording indicator in the browser
    DV_MEDIA_RECORDER.stream.getTracks().forEach(track => track.stop());
  }
  
  clearTimeout(DV_RECORD_TIMEOUT);
  DV_STATE.isRecording = false;
  
  const micBtn = document.getElementById(`dv-${DV_STATE.recordTarget}-mic`);
  if (micBtn) micBtn.classList.remove("dv-recording");
}

function dvProcessAndUploadAudio(roomType) {
  const blob = new Blob(DV_AUDIO_CHUNKS, { type: 'audio/webm' });
  const reader = new FileReader();
  
  reader.readAsDataURL(blob);
  reader.onloadend = async () => {
    dvShowLoader();
    const res = await dvNetworkPost({ 
      action: "sendAudio", 
      pin: DV_STATE.pin,
      audioBase64: reader.result,
      isPrivate: (roomType === "private")
    });
    dvHideLoader();
    
    if (!res.ok) dvShowToast(res.error);
  };
}

async function dvPlayAudio(audioId) {
  dvShowLoader();
  const res = await dvNetworkPost({ 
    action: "getAudio", 
    pin: DV_STATE.pin, 
    audioId: audioId 
  });
  dvHideLoader();

  if (res.ok && res.audioBase64) {
    const audio = new Audio(res.audioBase64);
    audio.play();
  } else {
    dvShowAlert("Audio file could not be retrieved or has been deleted.");
  }
}

/* ==========================================================================
   DV ADMIN CONTROLS
   ========================================================================== */

async function dvPushTicker() {
  const tickerInput = document.getElementById("dv-ticker-input").value.trim();
  if (!tickerInput) return dvShowToast("Ticker cannot be empty.");

  dvShowLoader();
  const res = await dvNetworkPost({ 
    action: "adminUpdateTicker", 
    pin: DV_STATE.pin, 
    ticker: tickerInput 
  });
  dvHideLoader();

  if (res.ok) {
    dvShowToast("Ticker updated successfully.");
    document.getElementById("dv-ticker-input").value = "";
  } else {
    dvShowAlert(res.error);
  }
}
