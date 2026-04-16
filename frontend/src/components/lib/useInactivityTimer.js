import { useEffect, useRef, useState } from "react";

const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 mins
const WARNING_TIME = 60 * 1000; // last 1 min

export default function useInactivityTimer(onLogout) {
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleTimeLeft, setIdleTimeLeft] = useState(INACTIVITY_LIMIT);

  const lastActivityRef = useRef(Date.now());

  // Track activity
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      setShowIdleWarning(false); // hide warning if user interacts
    };

    ["mousemove", "keydown", "click", "scroll"].forEach((event) => {
      window.addEventListener(event, updateActivity);
    });

    return () => {
      ["mousemove", "keydown", "click", "scroll"].forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      const remaining = INACTIVITY_LIMIT - elapsed;

      setIdleTimeLeft(remaining);

      if (remaining <= WARNING_TIME && remaining > 0) {
        setShowIdleWarning(true);
      }

      if (remaining <= 0) {
        clearInterval(interval);
        onLogout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [onLogout]);

  return {
    showIdleWarning,
    idleTimeLeft,
    setShowIdleWarning,
  };
}