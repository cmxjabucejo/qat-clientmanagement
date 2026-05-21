// src/components/lib/apiFetch.js

function clearAuthLocalStorage() {
  localStorage.removeItem("pendingChallengeId");
  localStorage.removeItem("pendingEmail");
  localStorage.removeItem("pendingExpiryAt");
  localStorage.removeItem("otpCooldownStart");

  // legacy auth keys from old flow
  localStorage.removeItem("userId");
  localStorage.removeItem("sessionVerified");
  localStorage.removeItem("loginTime");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userFirstname");
  localStorage.removeItem("userLastname");
  localStorage.removeItem("user_access_level");
  localStorage.removeItem("user_status");
  localStorage.removeItem("pendingUser");
  localStorage.removeItem("pendingOtpHashed");
}

function triggerSessionExpired() {
  window.dispatchEvent(new Event("session-expired"));
}

// 🔐 generate or reuse deviceId
// This is okay to keep in localStorage because it is NOT authentication.
function getDeviceId() {
  let deviceId = localStorage.getItem("deviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("deviceId", deviceId);
  }

  return deviceId;
}

export async function apiFetch(url, options = {}) {
  try {
    const deviceId = getDeviceId();

    const res = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
        ...(options.headers || {}),
      },
      ...options,
    });

    if (res.status === 401) {
      clearAuthLocalStorage();
      triggerSessionExpired();
      return null;
    }

    return res;
  } catch (err) {
    console.error("API error:", err);
    throw err;
  }
}