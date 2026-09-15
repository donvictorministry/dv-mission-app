/* ==========================================================================
   DV-MISSION APP - API & STORAGE ENGINE (api.js)
   Handles IndexedDB persistence and Google Apps Script Network Requests
   ========================================================================== */

const DV_CONFIG = {
  // IMPORTANT: Replace this with your actual Google Apps Script Web App URL
  API_URL: "YOUR_GAS_WEB_APP_URL_HERE",
  DB_NAME: "DVMissionDatabase",
  DB_VERSION: 1,
  NETWORK_TIMEOUT_MS: 20000
};

// Global Database Instance
let DV_DB = null;

/* ==========================================================================
   DV CONFIGURATION GUARD
   Fails loudly at load time if the GAS URL is still the placeholder.
   ========================================================================== */

(function dvCheckConfig() {
  if (!DV_CONFIG.API_URL || DV_CONFIG.API_URL.indexOf("YOUR_GAS") === 0) {
    console.error(
      "[DV] API_URL is not configured. Edit api.js and set DV_CONFIG.API_URL " +
      "to your deployed Google Apps Script Web App URL."
    );
  }
})();

/* ==========================================================================
   DV INDEXEDDB STORAGE (Offline Persistence)
   ========================================================================== */

function dvInitDatabase(onSuccessCallback) {
  let dvRequest;
  try {
    dvRequest = indexedDB.open(DV_CONFIG.DB_NAME, DV_CONFIG.DB_VERSION);
  } catch (err) {
    console.warn("[DV] IndexedDB unavailable:", err && err.message);
    return;
  }

  dvRequest.onupgradeneeded = (event) => {
    const db = event.target.result;

    if (!db.objectStoreNames.contains("dv_group_chats")) {
      db.createObjectStore("dv_group_chats", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("dv_private_chats")) {
      db.createObjectStore("dv_private_chats", { keyPath: "id" });
    }
  };

  dvRequest.onsuccess = (event) => {
    DV_DB = event.target.result;
    if (onSuccessCallback) onSuccessCallback();
  };

  dvRequest.onerror = (event) => {
    console.warn("[DV] Local database unavailable. Chat will not persist across sessions.");
  };

  dvRequest.onblocked = (event) => {
    console.warn("[DV] Local database upgrade blocked by another open tab.");
  };
}

function dvSaveMessageToLocal(storeName, messageObj) {
  if (!DV_DB) return;
  try {
    const transaction = DV_DB.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    store.put(messageObj);

    transaction.onerror = (event) => {
      console.warn("[DV] Failed to persist message locally:", event.target.error);
    };
  } catch (err) {
    console.warn("[DV] Save operation rejected:", err && err.message);
  }
}

function dvLoadMessagesFromLocal(storeName, callback) {
  if (!DV_DB) {
    if (callback) callback([]);
    return;
  }
  try {
    const transaction = DV_DB.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const dvRequest = store.getAll();

    dvRequest.onsuccess = () => {
      const rows = dvRequest.result || [];
      // Sort numerically by time — IndexedDB string keys don't sort as numbers
      rows.sort((a, b) => (a.time || 0) - (b.time || 0));
      if (callback) callback(rows);
    };

    dvRequest.onerror = (event) => {
      console.warn("[DV] Failed to read local messages:", event.target.error);
      if (callback) callback([]);
    };
  } catch (err) {
    console.warn("[DV] Load operation rejected:", err && err.message);
    if (callback) callback([]);
  }
}

/* ==========================================================================
   DV NETWORK ENGINE (Secure POST to GAS)
   ========================================================================== */

/**
 * Sends data to the GAS backend.
 * Returns the parsed JSON response on success.
 * Returns { ok: false, code, error } on any failure mode.
 *
 * Failure modes are logged to console for debugging but always
 * surface a single friendly message to the caller.
 */
async function dvNetworkPost(payload) {
  // Guard against the placeholder URL never being replaced
  if (!DV_CONFIG.API_URL || DV_CONFIG.API_URL.indexOf("YOUR_GAS") === 0) {
    return {
      ok: false,
      code: 500,
      error: "App is not configured. Contact the administrator."
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DV_CONFIG.NETWORK_TIMEOUT_MS);

  try {
    const response = await fetch(DV_CONFIG.API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        // GAS requires text/plain to avoid a CORS preflight
        "Content-Type": "text/plain;charset=utf-8"
      },
      signal: controller.signal,
      redirect: "follow"
    });

    // GAS always returns HTTP 200 with a JSON body, even for auth failures.
    // If we get anything else, something upstream (proxy, redirect, cold-start
    // error page) is interfering. Try to parse anyway, because GAS sometimes
    // returns 302 -> 200 with a valid body.
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.warn("[DV] Server returned non-JSON response. Status:", response.status);
      return {
        ok: false,
        code: response.status || 500,
        error: "Server returned an unexpected response. Please try again."
      };
    }

    return data;

  } catch (error) {
    if (error && error.name === "AbortError") {
      console.warn("[DV] Request timed out after", DV_CONFIG.NETWORK_TIMEOUT_MS, "ms");
      return {
        ok: false,
        code: 504,
        error: "Server took too long to respond. Please try again."
      };
    }

    console.warn("[DV] Network request failed:", error && error.message);
    return {
      ok: false,
      code: 503,
      error: "Network connection lost. Please check your internet and try again."
    };

  } finally {
    clearTimeout(timeoutId);
  }
}