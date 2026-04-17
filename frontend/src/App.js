import React, { useEffect, useState, useCallback } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  Outlet,
} from "react-router-dom";

import OauthLogin from "./components/Routes/OauthLogin";
import ClientRoster from "./components/Routes/ClientRosterPage";
import ClientEscalations from "./components/Routes/ClientEscalationsPage";
import VOCS from "./components/Routes/VOCS";
import Register from "./components/Routes/Register";
import OtpVerification from "./components/common/OtpVerification";

import SessionExpiredModal from "./components/common/SessionExpiredModal";
import SessionWarningModal from "./components/common/SessionWarningModal";
import IdleWarningModal from "./components/common/IdleWarningModal";

import useSessionTimer from "./components/lib/useSessionTimer";
import useInactivityTimer from "./components/lib/useInactivityTimer";

import { SERVER_URL } from "./components/lib/constants";

/*
========================================
🔐 AUTH GUARD
========================================
*/
function RequireAuth({ isAuthed }) {
  const location = useLocation();

  if (!isAuthed) {
    return (
      <Navigate
        to="/OauthLogin"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

/*
========================================
🔐 ROLE GUARD
========================================
*/
function RequireAdminOrHigher({ user }) {
  const location = useLocation();

  if (user?.userLevel === "User") {
    return (
      <Navigate
        to="/ClientEscalations"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

/*
========================================
🔐 REDIRECT IF AUTHED
========================================
*/
function RedirectIfAuthenticated({ isAuthed, children }) {
  return isAuthed ? (
    <Navigate to="/ClientEscalations" replace />
  ) : (
    children
  );
}

/*
========================================
🚀 MAIN APP
========================================
*/
export default function App() {
  const [isAuthed, setIsAuthed] = useState(null);
  const [user, setUser] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  /*
  ========================================
  🔁 REDIRECT
  ========================================
  */
  const handleLoginRedirect = useCallback(() => {
    window.location.href = "/OauthLogin";
  }, []);

  /*
  ========================================
  🔒 EXPIRE
  ========================================
  */
  const handleExpire = useCallback(() => {
    setSessionExpired(true);
    setIsAuthed(false);
    setUser(null);
  }, []);

  /*
  ========================================
  🔍 SESSION CHECK
  ========================================
  */
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/session`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (res.ok && data.success && data.user) {
          setUser(data.user);
          setIsAuthed(true);
        } else {
          setUser(null);
          setIsAuthed(false);
        }
      } catch (err) {
        console.error("Session check failed:", err);
        setIsAuthed(false);
      }
    };

    checkSession();
  }, []);

  /*
  ========================================
  🔔 GLOBAL SESSION EXPIRED
  ========================================
  */
  useEffect(() => {
    const onSessionExpired = () => handleExpire();

    window.addEventListener("session-expired", onSessionExpired);
    return () =>
      window.removeEventListener("session-expired", onSessionExpired);
  }, [handleExpire]);

  /*
  ========================================
  ⏳ TIMERS
  ========================================
  */
  const { showWarning, timeLeft, setShowWarning } =
    useSessionTimer(handleExpire);

  const { showIdleWarning, idleTimeLeft, setShowIdleWarning } =
    useInactivityTimer(handleExpire);

  /*
  ========================================
  ⏳ LOADING
  ========================================
  */
  if (isAuthed === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  /*
  ========================================
  🚀 ROUTES
  ========================================
  */
  return (
    <>
      <Routes>
        {/* PUBLIC */}
        <Route
          path="/"
          element={
            <RedirectIfAuthenticated isAuthed={isAuthed}>
              <OauthLogin />
            </RedirectIfAuthenticated>
          }
        />

        <Route
          path="/OauthLogin"
          element={
            <RedirectIfAuthenticated isAuthed={isAuthed}>
              <OauthLogin />
            </RedirectIfAuthenticated>
          }
        />

        <Route path="/Register" element={<Register />} />
        <Route path="/OTP-SECURE" element={<OtpVerification />} />

        {/* PROTECTED */}
        <Route element={<RequireAuth isAuthed={isAuthed} />}>
          <Route element={<RequireAdminOrHigher user={user} />}>
            <Route path="/ClientRoster" element={<ClientRoster user={user} />} />
            <Route path="/VOCS" element={<VOCS user={user} />} />
          </Route>

          <Route
            path="/ClientEscalations"
            element={<ClientEscalations user={user} />}
          />
        </Route>

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/OauthLogin" replace />} />
      </Routes>

      <SessionExpiredModal
        show={sessionExpired}
        onLogin={handleLoginRedirect}
      />

      <SessionWarningModal
        show={showWarning && !sessionExpired}
        timeLeft={timeLeft}
      />

      <IdleWarningModal
        show={showIdleWarning && !sessionExpired}
        timeLeft={idleTimeLeft}
      />
    </>
  );
}