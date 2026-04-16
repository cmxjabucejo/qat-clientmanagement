import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SERVER_URL } from "../lib/constants";
import UserService from "../../service/UserService";
import pkg from "../../../package.json";
import { apiFetch } from "../lib/apiFetch";

const OtpVerification = () => {
  const otpRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const APP_VERSION = pkg.version;

  const [enteredOtp, setEnteredOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emailAddress, setEmailAddress] = useState("");

  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendDots, setResendDots] = useState("");
  const [isResending, setIsResending] = useState(false);

  const formatCooldown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ✅ Initialize email + validate session
  useEffect(() => {
    const email =
      location.state?.emailAddress || localStorage.getItem("pendingEmail");

    const challengeId = localStorage.getItem("pendingChallengeId");
    const expiry = localStorage.getItem("pendingExpiryAt");

    if (!email || !challengeId || !expiry) {
      setError("Session expired. Please request a new OTP.");
      return;
    }

    setEmailAddress(email);
    localStorage.setItem("pendingEmail", email);

    // ✅ RESET STATE (important for resend cases)
    setIsExpired(false);
    setError("");
    setSuccess("");

    const expiryTime = new Date(expiry).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.floor((expiryTime - now) / 1000);

      if (diff <= 0) {
        setTimeLeft(0);
        setIsExpired(true);
        return false; // stop interval
      } else {
        setTimeLeft(diff);
        return true;
      }
    };

    // run immediately (no 1s delay)
    const shouldContinue = updateTimer();

    if (!shouldContinue) return;

    const interval = setInterval(() => {
      const keepRunning = updateTimer();
      if (!keepRunning) clearInterval(interval);
    }, 1000);

    // 🔥 AUTO-FOCUS OTP INPUT
    setTimeout(() => {
      otpRef.current?.focus();
    }, 100);

    return () => clearInterval(interval);
  }, [location.state]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ✅ VERIFY OTP (SECURE - SERVER SIDE)
  const handleVerifyOtp = async () => {
    setError("");
    setSuccess("");

    if (isExpired) {
      setError("OTP has expired. Please request a new one.");
      return;
    }

    const challengeId = localStorage.getItem("pendingChallengeId");

    if (!challengeId) {
      setError("Session expired. Please request a new OTP.");
      return;
    }

    if (!enteredOtp) {
      setError("Please enter the OTP.");
      return;
    }

    if (enteredOtp.length !== 6) {
      setError("OTP must be 6 digits.");
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

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Invalid OTP");
        return;
      }

      setSuccess("OTP verified successfully!");

      const user = data.user;

      // ✅ Finalize login (temporary - localStorage based)
      UserService.loginUser({
        userId: user.userid,
        email: user.userEmail,
        firstname: user.firstName || user.fullName || "",
        lastname: user.lastName || "",
        providerId: user.userEmail,
        userLevel: user.userLevel,
        userStatus: user.userStatus,
      });

      // ✅ CLEANUP (IMPORTANT)
      localStorage.removeItem("pendingChallengeId");
      localStorage.removeItem("pendingEmail");
      localStorage.removeItem("pendingExpiryAt");

      if (UserService.clearPendingUser) {
        UserService.clearPendingUser();
      }

      // slight delay for UX
      setTimeout(() => {
        navigate("/ClientRoster", { replace: true });
      }, 300);

    } catch (err) {
      console.error("OTP Verification Error:", err);
      setError("Could not verify OTP. Please try again.");
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setSuccess("");
    setIsResending(true);

    const email = localStorage.getItem("pendingEmail");

    if (!email) {
      setError("Session expired. Please restart login.");
      setIsResending(false);
      return;
    }

    try {
      const res = await apiFetch(`${SERVER_URL}/api/sendOTP`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailAddress: email,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Failed to resend OTP.");
        setIsResending(false);
        return;
      }

      // ✅ Reset OTP state
      setEnteredOtp(""); // 🔥 clear old OTP

      localStorage.setItem("pendingChallengeId", data.challengeId);
      localStorage.setItem("pendingExpiryAt", data.expiresAt);

      const expiryTime = new Date(data.expiresAt).getTime();
      setTimeLeft(Math.floor((expiryTime - Date.now()) / 1000));
      setIsExpired(false);

      setResendCooldown(60);

      setSuccess("A new OTP has been sent.");

      // 🔥 auto-focus again
      setTimeout(() => {
        otpRef.current?.focus();
      }, 150);

    } catch (err) {
      console.error(err);
      setError("Could not resend OTP.");
    } finally {
      setIsResending(false);
    }
  };

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

  useEffect(() => {
    if (!isResending) {
      setResendDots("");
      return;
    }

    const interval = setInterval(() => {
      setResendDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 400);

    return () => clearInterval(interval);
  }, [isResending]);

  useEffect(() => {
    if (!error && !success) return;

    const timeout = setTimeout(() => {
      setError("");
      setSuccess("");
    }, 4000);

    return () => clearTimeout(timeout);
  }, [error, success]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#061326]">
      {/* Glow background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-72 h-72 bg-[#00a1c9]/15 rounded-full blur-3xl absolute -top-16 -left-10" />
        <div className="w-72 h-72 bg-[#f58220]/10 rounded-full blur-3xl absolute bottom-0 right-0" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/10 border border-white/30 backdrop-blur-lg text-white px-10 py-7 rounded-xl shadow-[0_8px_32px_rgba(31,38,135,0.37)] w-full">

          <h2 className="text-lg font-bold text-white mb-4 text-center">
            Verify OTP
          </h2>

          <p className="text-sm mb-4 text-white/80 text-center">
            Enter the OTP sent to <strong>{emailAddress}</strong>
          </p>

          <input
            ref={otpRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="• • • • • •"
            maxLength={6}
            value={enteredOtp}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, ""); // digits only
              setEnteredOtp(value);

              if (error || success) {
                setError("");
                setSuccess("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerifyOtp();
            }}
            disabled={isExpired}
            className={`w-full border px-3 py-2 rounded text-center text-lg tracking-widest focus:outline-none
              ${
                isExpired
                  ? "bg-gray-500/20 text-gray-400 border-gray-500 cursor-not-allowed"
                  : "bg-white/10 text-white border-white/20 placeholder-white/50"
              }`}
          />

          <div className="text-center mt-2 text-sm">
            {isExpired ? (
              <div className="flex flex-col items-center gap-1">

                <span className="text-red-400 font-semibold">
                  OTP expired
                </span>

                {resendCooldown > 0 ? (
                  <span className="text-gray-400 text-sm">
                    Resend available in {formatCooldown(resendCooldown)}
                  </span>
                ) : (
                  <button
                    onClick={handleResendOtp}
                    disabled={isResending}
                    className="text-[#00c2ff] text-sm hover:underline"
                  >
                  {isResending
                    ? `Resending via Secure Channel${resendDots}`
                    : "Request a new OTP"}
                  </button>
                )}

              </div>
            ) : (
              <span className="text-yellow-300">
                Expires in: {formatTime(timeLeft)}
              </span>
            )}          </div>

          {error && (
            <p className="text-red-400 text-sm mt-2 text-center bg-white/10 rounded py-1 px-2">
              {error}
            </p>
          )}

          {success && (
            <p className="text-green-400 text-sm mt-2 text-center bg-white/10 rounded py-1 px-2">
              {success}
            </p>
          )}

          <button
            onClick={handleVerifyOtp}
            disabled={isExpired}
            className={`w-full mt-4 py-2 rounded text-white ${
              isExpired
                ? "bg-gray-500 cursor-not-allowed"
                : "bg-[#0084a4] hover:bg-[#015368]"
            }`}
          >
            Verify OTP
          </button>
        </div>
      </div>

      <div className="absolute bottom-2 left-0 w-full px-4">
        <p className="text-[10px] text-white text-center">
          © 2025 CMX Client Management Suite v{APP_VERSION}
        </p>
        <p className="text-[10px] text-white text-center">
          DREAM Dev Ops || Callmax Solutions International
        </p>
      </div>
    </div>
  );
};

export default OtpVerification;