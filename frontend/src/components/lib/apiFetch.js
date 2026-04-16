function handleSessionExpiry() {
  console.warn("Session expired");

  // clear local UI state
  localStorage.clear();

  // redirect to login
  window.location.href = "/";
}

function triggerSessionExpired() {
  window.dispatchEvent(new Event("session-expired"));
}

export async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      ...options,
    });

    if (res.status === 401) {
      triggerSessionExpired(); // 🔥 trigger UI instead
      return null;
    }

    return res;
  } catch (err) {
    console.error("API error:", err);
    throw err;
  }
}