import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { SERVER_URL } from "../lib/constants";
import pkg from "../../../package.json";
import { apiFetch } from "../lib/apiFetch";
import { getCSRFToken } from "../../service/CSRFService";
import { useCsrfStore } from "../../store/csrfStore";

const OtpVerification = () => {
  const otpRef = useRef(null);
  const location = useLocation();
  const APP_VERSION = pkg.version;

  const GENERIC_AUTH_MESSAGE = "Invalid credentials or authentication request";

  const [enteredOtp, setEnteredOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailAddress, setEmailAddress] = useState("");

  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendDots, setResendDots] = useState("");

  /*
  ========================================
  ⏱ FORMATTERS
  ========================================
  */
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  /*
  ========================================
  🔁 INIT OTP SESSION + TIMER
  ========================================
  */
  useEffect(() => {
    const email =
      location.state?.emailAddress || localStorage.getItem("pendingEmail");

    const challengeId = localStorage.getItem("pendingChallengeId");
    const expiry = localStorage.getItem("pendingExpiryAt");

    if (!email || !challengeId || !expiry) {
      setError(GENERIC_AUTH_MESSAGE);
      return;
    }

    setEmailAddress(email);
    localStorage.setItem("pendingEmail", email);

    setError("");
    setSuccess("");
    setIsExpired(false);

    const expiryTime = new Date(expiry).getTime();

    const interval = setInterval(() => {
      const diff = Math.floor((expiryTime - Date.now()) / 1000);

      if (diff <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
        clearInterval(interval);
      } else {
        setTimeLeft(diff);
      }
    }, 1000);

    const cooldownStart = localStorage.getItem("otpCooldownStart");

    if (cooldownStart) {
      const elapsed = Math.floor((Date.now() - Number(cooldownStart)) / 1000);
      const remaining = 60 - elapsed;

      if (remaining > 0) {
        setResendCooldown(remaining);
      }
    }

    setTimeout(() => otpRef.current?.focus(), 100);

    return () => clearInterval(interval);
  }, [location.state]);

  /*
  ========================================
  🔐 VERIFY OTP
  ========================================
  */
  const handleVerifyOtp = async () => {
    setError("");
    setSuccess("");

    if (isExpired) {
      setError(GENERIC_AUTH_MESSAGE);
      return;
    }

    const challengeId = localStorage.getItem("pendingChallengeId");

    if (!challengeId) {
      setError(GENERIC_AUTH_MESSAGE);
      return;
    }

    if (!enteredOtp || enteredOtp.length !== 6) {
      setError(GENERIC_AUTH_MESSAGE);
      return;
    }

    try {
      const res = await apiFetch(`${SERVER_URL}/api/verifyOTP`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId,
          otp: enteredOtp,
        }),
      });

      if (!res) {
        setError(GENERIC_AUTH_MESSAGE);
        return;
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(GENERIC_AUTH_MESSAGE);
        return;
      }

      const csrfToken = await getCSRFToken();
      useCsrfStore.getState().setCsrfToken(csrfToken);
      setSuccess("Authentication request verified.");

      localStorage.removeItem("pendingChallengeId");
      localStorage.removeItem("pendingEmail");
      localStorage.removeItem("pendingExpiryAt");
      localStorage.removeItem("otpCooldownStart");

      setTimeout(() => {
        window.location.href = "/ClientEscalations";
      }, 400);
    } catch (err) {
      console.error("VERIFY OTP ERROR:", err);
      setError(GENERIC_AUTH_MESSAGE);
    }
  };

  /*
  ========================================
  🔁 RESEND OTP
  ========================================
  */
  const handleResendOtp = async () => {
    if (isResending || resendCooldown > 0) return;

    setError("");
    setSuccess("");
    setIsResending(true);

    const email = localStorage.getItem("pendingEmail");

    if (!email) {
      setError(GENERIC_AUTH_MESSAGE);
      setIsResending(false);
      return;
    }

    try {
      const res = await apiFetch(`${SERVER_URL}/api/sendOTP`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emailAddress: email }),
      });

      if (!res) {
        setError(GENERIC_AUTH_MESSAGE);
        return;
      }

      if (res.status === 429) {
        setError(GENERIC_AUTH_MESSAGE);
        setResendCooldown(60);
        return;
      }

      const data = await res.json();

      if (!res.ok || !data.success || !data.challengeId || !data.expiresAt) {
        setError(GENERIC_AUTH_MESSAGE);
        return;
      }

      setEnteredOtp("");

      localStorage.setItem("pendingChallengeId", data.challengeId);
      localStorage.setItem("pendingExpiryAt", data.expiresAt);
      localStorage.setItem("otpCooldownStart", Date.now());

      const expiryTime = new Date(data.expiresAt).getTime();
      setTimeLeft(Math.floor((expiryTime - Date.now()) / 1000));
      setIsExpired(false);

      setResendCooldown(60);
      setSuccess("Authentication request refreshed.");

      setTimeout(() => otpRef.current?.focus(), 150);
    } catch (err) {
      console.error("RESEND OTP ERROR:", err);
      setError(GENERIC_AUTH_MESSAGE);
    } finally {
      setIsResending(false);
    }
  };

  /*
  ========================================
  ⏳ COOLDOWN TIMER
  ========================================
  */
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [resendCooldown]);

  /*
  ========================================
  ✨ DOTS ANIMATION
  ========================================
  */
  useEffect(() => {
    if (!isResending) {
      setResendDots("");
      return;
    }

    const interval = setInterval(() => {
      setResendDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [isResending]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#061326]">
      <div className="relative w-full max-w-md">
        <div className="bg-white/10 border border-white/30 backdrop-blur-lg text-white px-10 py-7 rounded-xl w-full">
          <h2 className="text-lg font-bold text-center mb-1">
            Client Management Suite
          </h2>

          <h3 className="text-md font-semibold text-center mb-4">
            OTP Verification
          </h3>

          <p className="text-sm text-left mb-4 leading-relaxed text-white/90">
            If the authentication request is valid, an OTP has been sent. Please
            enter it below to sign in.
          </p>

          <input
            ref={otpRef}
            type="text"
            maxLength={6}
            value={enteredOtp}
            onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerifyOtp();
            }}
            placeholder="- - - - - -"
            className="w-full text-center text-lg tracking-[0.6em] bg-white/10 border border-white/20 px-3 py-3 rounded text-white placeholder-white/50"
          />

          <div className="text-center mt-3 text-sm">
            {isExpired ? (
              resendCooldown > 0 ? (
                <span className="text-gray-400">
                  Resend in {formatTime(resendCooldown)}
                </span>
              ) : (
                <button
                  onClick={handleResendOtp}
                  disabled={isResending || resendCooldown > 0}
                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResending ? `Resending${resendDots}` : "Request new OTP"}
                </button>
              )
            ) : (
              <span className="text-yellow-300">
                Expires in {formatTime(timeLeft)}
              </span>
            )}
          </div>

          {error && <p className="text-red-400 text-center mt-2">{error}</p>}

          {success && (
            <p className="text-green-400 text-center mt-2">{success}</p>
          )}

          <button
            onClick={handleVerifyOtp}
            disabled={isExpired}
            className="w-full mt-4 py-2 bg-[#0084a4] rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Verify OTP
          </button>
        </div>
      </div>

      <div className="absolute bottom-2 w-full text-center text-xs text-white">
        © 2025 CMX Client Management Suite v{APP_VERSION}
      </div>
    </div>
  );
};

export default OtpVerification;
