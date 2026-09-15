/* ==========================================================================
   DV-MISSION APP - API & STORAGE ENGINE (api.js)
   Handles IndexedDB persistence and Google Apps Script Network Requests
   ========================================================================== */

const DV_CONFIG = {
  // IMPORTANT: Replace this with your actual Google Apps Script Web App URL
  API_URL: "YOUR_GAS_WEB_APP_URL_HERE", 
  DB_NAME: "DVMissionDatabase",
  DB_VERSION: 1
};

// Global Database Instance
let DV_DB = null;

/* ==========================================================================
   DV INDEXEDDB STORAGE (Offline Persistence)
   ========================================================================== */

function dvInitDatabase(onSuccessCallback) {
  const dvRequest = indexedDB.open(DV_CONFIG.DB_NAME, DV_CONFIG.DB_VERSION);

  dvRequest.onupgradeneeded = (event) => {
    const db = event.target.result;
    
    // Store for Public Group Chat
    if (!db.objectStoreNames.contains("dv_group_chats")) {
      db.createObjectStore("dv_group_chats", { keyPath: "id" });
    }
    
    // Store for Private Admin Chat
    if (!db.objectStoreNames.contains("dv_private_chats")) {
      db.createObjectStore("dv_private_chats", { keyPath: "id" });
    }
  };

  dvRequest.onsuccess = (event) => {
    DV_DB = event.target.result;
    if (onSuccessCallback) onSuccessCallback();
  };

  dvRequest.onerror = (event) => {
    // Silent catch - we don't want to alert the user with technical DB errors
    console.warn("DV Storage warning: Unable to initialize local database.");
  };
}

function dvSaveMessageToLocal(storeName, messageObj) {
  if (!DV_DB) return;
  try {
    const transaction = DV_DB.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    store.put(messageObj);
  } catch (err) {
    // Failsafe catch for storage quota issues
  }
}

function dvLoadMessagesFromLocal(storeName, callback) {
  if (!DV_DB) return;
  try {
    const transaction = DV_DB.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const dvRequest = store.getAll();

    dvRequest.onsuccess = () => {
      if (callback) callback(dvRequest.result);
    };
  } catch (err) {
    // Failsafe catch
  }
}

/* ==========================================================================
   DV NETWORK ENGINE (Secure POST to GAS)
   ========================================================================== */

/**
 * Sends data to GAS backend.
 * Guarantees a clean { ok: false, error: "message" } object on failure.
 * Zero stack-trace pollution.
 */
async function dvNetworkPost(payload) {
  try {
    // Google Apps Script requires 'text/plain' to avoid preflight CORS errors
    const response = await fetch(DV_CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      }
    });

    // If the server returns a 500 HTML error instead of JSON, catch it before it crashes the parser
    if (!response.ok) {
      throw new Error("Server communication failed.");
    }

    const data = await response.json();
    return data;
    
  } catch (error) {
    // Graceful UX Fallback: If network drops, DNS fails, or JSON parser crashes
    return { 
      ok: false, 
      code: 503, 
      error: "Network connection lost. Please check your internet and try again." 
    };
  }
}
