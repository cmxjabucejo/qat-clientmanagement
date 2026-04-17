import { useEffect, useRef, useState } from "react";

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const WARNING_TIME = 2 * 60 * 1000; // show warning at last 2 mins

export default function useSessionTimer(onExpire) {
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_DURATION);

  const lastActivityRef = useRef(Date.now());

  // Track user activity
  useEffect(() => {
    const updateActivity = () => {
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

  // Timer loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const remaining = SESSION_DURATION - elapsed;

      setTimeLeft(remaining);

      if (remaining <= WARNING_TIME && remaining > 0) {
        setShowWarning(true);
      }

      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [onExpire]);

  return { showWarning, timeLeft, setShowWarning };
}