// src/service/UserService.js
import { SERVER_URL } from "../components/lib/constants";
import { apiFetch } from "../components/lib/apiFetch";

class UserService {
  static BASE_URL = SERVER_URL;

  /*
  ========================================
  SERVER SESSION CHECK
  Source of truth: backend Redis session
  ========================================
  */
  static async getSession() {
    try {
      const res = await apiFetch(`${this.BASE_URL}/api/session`, {
        method: "GET",
        credentials: "include",
      });

      if (!res || !res.ok) {
        return {
          authenticated: false,
          user: null,
        };
      }

      const data = await res.json();

      return {
        authenticated: Boolean(data?.success && data?.user),
        user: data?.user || null,
      };
    } catch (err) {
      console.error("Session check failed:", err);

      return {
        authenticated: false,
        user: null,
      };
    }
  }

  /*
  ========================================
  AUTH STATUS
  IMPORTANT: This is now async.
  ========================================
  */
  static async isAuthenticated() {
    const session = await this.getSession();
    return session.authenticated;
  }

  /*
  ========================================
  CURRENT USER
  ========================================
  */
  static async getCurrentUser() {
    const session = await this.getSession();
    return session.user;
  }

  /*
  ========================================
  LOGOUT
  Backend destroys Redis session.
  Frontend only clears temporary/local legacy values.
  ========================================
  */
  static async logout() {
    try {
      await apiFetch(`${this.BASE_URL}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      this.clearLocalAuthData();
    }
  }

  /*
  ========================================
  LOCAL CLEANUP ONLY
  Do not use localStorage as auth source.
  ========================================
  */
  static clearLocalAuthData() {
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
    localStorage.removeItem("pendingEmail");
    localStorage.removeItem("pendingChallengeId");
    localStorage.removeItem("pendingExpiryAt");
    localStorage.removeItem("otpCooldownStart");
  }

  /*
  ========================================
  DEPRECATED METHODS
  Kept temporarily so old imports do not crash.
  Remove later after all components are updated.
  ========================================
  */
  static setPendingUser() {
    console.warn(
      "UserService.setPendingUser is deprecated. Authentication is now handled by Redis-backed backend sessions."
    );
  }

  static getPendingUser() {
    return null;
  }

  static clearPendingUser() {
    localStorage.removeItem("pendingUser");
    localStorage.removeItem("pendingOtpHashed");
    localStorage.removeItem("pendingEmail");
  }

  static loginUser() {
    console.warn(
      "UserService.loginUser is deprecated. Login is now handled by backend Redis session."
    );
    return null;
  }
}

export default UserService;