
import { useEffect, useRef, useState } from "react";

const SESSION_DURATION = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 1 * 60 * 1000;      // last 1 minute

export default function useUnifiedSessionTimer(onExpire) {
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);

  const lastActivityRef = useRef(Date.now());
  const isLockedRef = useRef(false);

  const formatTime = (ms) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  /*
  ========================================
  🖱️ TRACK ACTIVITY
  ========================================
  */
  useEffect(() => {
    const updateActivity = () => {
      if (isLockedRef.current) return;
      lastActivityRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !isLockedRef.current) {
        lastActivityRef.current = Date.now();
      }
    };

    window.addEventListener("mousemove", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("click", updateActivity);
    window.addEventListener("scroll", updateActivity);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("mousemove", updateActivity);
      window.removeEventListener("keydown", updateActivity);
      window.removeEventListener("click", updateActivity);
      window.removeEventListener("scroll", updateActivity);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  /*
  ========================================
  ⏳ TIMER LOOP
  ========================================
  */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const remaining = Math.max(0, SESSION_DURATION - elapsed);

      setTimeLeft(remaining);

      // 🔥 Trigger warning ONCE
      if (remaining <= WARNING_TIME && remaining > 0 && !isLockedRef.current) {
        isLockedRef.current = true;
        setShowWarning(true);
      }

      // 🔥 Force logout
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [onExpire]);

  /*
  ========================================
  🔄 RESET (Stay Active)
  ========================================
  */
  const resetSession = () => {
    isLockedRef.current = false;
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  };

  return {
    showWarning,
    formattedTime: formatTime(timeLeft),
    resetSession,
  };
}
