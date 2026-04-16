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

const SERVER_URL = process.env.REACT_APP_SERVER_URL;

/*
========================================
🔐 AUTH GUARD (SESSION-BASED)
========================================
*/
function RequireAuth({ isAuthed }) {
  const location = useLocation();

  if (isAuthed === false) {
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
🔐 ROLE GUARD (UI-ONLY)
========================================
*/
function RequireAdminOrHigher() {
  const location = useLocation();
  const accessLevel = localStorage.getItem("user_access_level");

  if (accessLevel === "User") {
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
🔐 REDIRECT IF ALREADY LOGGED IN
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
  const [sessionExpired, setSessionExpired] = useState(false);

  /*
  ========================================
  🔁 REDIRECT TO LOGIN
  ========================================
  */
  const handleLoginRedirect = useCallback(() => {
    localStorage.clear();
    window.location.href = "/OauthLogin";
  }, []);

  /*
  ========================================
  🔒 EXPIRE SESSION STATE
  ========================================
  */
  const handleExpire = useCallback(() => {
    setSessionExpired(true);
    setIsAuthed(false);
  }, []);

  /*
  ========================================
  🔍 CHECK SESSION ON LOAD
  ========================================
  */
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/session`, {
          method: "GET",
          credentials: "include",
        });

        if (res.ok) {
          setIsAuthed(true);
        } else {
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
  🔔 LISTEN FOR GLOBAL SESSION EXPIRY
  ========================================
  */
  useEffect(() => {
    const onSessionExpired = () => {
      handleExpire();
    };

    window.addEventListener("session-expired", onSessionExpired);

    return () => {
      window.removeEventListener("session-expired", onSessionExpired);
    };
  }, [handleExpire]);

  /*
  ========================================
  ⏳ SESSION TIMER (8 HRS WARNING FLOW)
  ========================================
  */
  const {
    showWarning,
    timeLeft,
    setShowWarning,
  } = useSessionTimer(handleExpire);

  /*
  ========================================
  💤 INACTIVITY TIMER (15 MINS IDLE LOGOUT)
  ========================================
  */
  const {
    showIdleWarning,
    idleTimeLeft,
    setShowIdleWarning,
  } = useInactivityTimer(handleExpire);

  /*
  ========================================
  🔄 STAY LOGGED IN (SESSION WARNING)
  ========================================
  */
  const handleStayLoggedIn = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/session`, {
        method: "GET",
        credentials: "include",
      });

      if (res.ok) {
        setShowWarning(false);
      } else {
        handleLoginRedirect();
      }
    } catch (err) {
      console.error("Session refresh failed:", err);
      handleLoginRedirect();
    }
  };

  /*
  ========================================
  🖱 STAY ACTIVE (IDLE WARNING)
  ========================================
  */
  const handleStayActive = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/session`, {
        method: "GET",
        credentials: "include",
      });

      if (res.ok) {
        setShowIdleWarning(false);
      } else {
        handleLoginRedirect();
      }
    } catch (err) {
      console.error("Idle keepalive failed:", err);
      handleLoginRedirect();
    }
  };

  /*
  ========================================
  ⏳ LOADING STATE
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
        {/* PUBLIC ROUTES */}
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

        {/* PROTECTED ROUTES */}
        <Route element={<RequireAuth isAuthed={isAuthed} />}>
          <Route element={<RequireAdminOrHigher />}>
            <Route path="/ClientRoster" element={<ClientRoster />} />
            <Route path="/VOCS" element={<VOCS />} />
          </Route>

          <Route
            path="/ClientEscalations"
            element={<ClientEscalations />}
          />
        </Route>

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/OauthLogin" replace />} />
      </Routes>

      {/* 🔴 SESSION EXPIRED */}
      <SessionExpiredModal
        show={sessionExpired}
        onLogin={handleLoginRedirect}
      />

      {/* 🟡 SESSION WARNING */}
      <SessionWarningModal
        show={showWarning && !sessionExpired}
        timeLeft={timeLeft}
        onStay={handleStayLoggedIn}
      />

      {/* 💤 IDLE WARNING */}
      <IdleWarningModal
        show={showIdleWarning && !sessionExpired}
        timeLeft={idleTimeLeft}
        onStay={handleStayActive}
      />
    </>
  );
}