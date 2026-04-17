function handleSessionExpiry() {
  console.warn("Session expired");

  localStorage.clear();
  window.location.href = "/";
}

function triggerSessionExpired() {
  window.dispatchEvent(new Event("session-expired"));
}

// 🔐 generate or reuse deviceId
function getDeviceId() {
  let deviceId = localStorage.getItem("deviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID(); // 🔥 unique per browser
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
        "x-device-id": deviceId, // 🔥 ADD THIS
        ...(options.headers || {}),
      },
      ...options,
    });

    if (res.status === 401) {
      triggerSessionExpired();
      return null;
    }

    return res;
  } catch (err) {
    console.error("API error:", err);
    throw err;
  }
}