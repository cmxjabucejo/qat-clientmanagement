import { useEffect, useRef, useState } from "react";

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const WARNING_TIME = 2 * 60 * 1000; // last 2 mins

export default function useSessionTimer(onExpire) {
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);

  const lastActivityRef = useRef(Date.now());
  const isLockedRef = useRef(false); // 🔥 LOCK

  /*
  ========================================
  🖱️ TRACK USER ACTIVITY
  ========================================
  */
  useEffect(() => {
    const updateActivity = () => {
      // ❌ DO NOT update if already in warning state
      if (isLockedRef.current) return;

      lastActivityRef.current = Date.now();
    };

    window.addEventListener("mousemove", updateActivity);
    window.addEventListener("keydown", updateActivity);
    window.addEventListener("click", updateActivity);

    return () => {
      window.removeEventListener("mousemove", updateActivity);
      window.removeEventListener("keydown", updateActivity);
      window.removeEventListener("click", updateActivity);
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
      const remaining = SESSION_DURATION - elapsed;

      setTimeLeft(remaining);

      // 🔥 TRIGGER WARNING ONCE AND LOCK
      if (remaining <= WARNING_TIME && remaining > 0 && !isLockedRef.current) {
        isLockedRef.current = true;   // 🔥 LOCK
        setShowWarning(true);
      }

      // 🔥 FORCE LOGOUT
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [onExpire]);

  /*
  ========================================
  🔄 MANUAL RESET (Stay Active)
  ========================================
  */
  const resetSession = () => {
    isLockedRef.current = false;       // 🔓 UNLOCK
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  };

  return { showWarning, timeLeft, setShowWarning, resetSession };
}