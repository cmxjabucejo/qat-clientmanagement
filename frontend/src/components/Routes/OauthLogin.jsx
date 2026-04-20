import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SERVER_URL } from "../lib/constants";
import logo from "../../assets/callmax_cover_removebg.png";
import UserService from "../../service/UserService";
import pkg from "../../../package.json";
import { apiFetch } from "../lib/apiFetch";

const OauthLogin = () => {
  const navigate = useNavigate();
  const APP_VERSION = pkg.version;

  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!isSending) {
      setDots("");
      return;
    }

    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 400);

    return () => clearInterval(interval);
  }, [isSending]);

  const isCallmaxEmail = (value) => {
    const trimmed = (value || "").trim().toLowerCase();
    return trimmed.endsWith("@callmaxsolutions.com");
  };

  const handleManualOtpLogin = async () => {
    setError("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    if (!isCallmaxEmail(email)) {
      setError("Please use your Callmax email address.");
      return;
    }

    setIsSending(true);

    try {
      // ===============================
      // 1️⃣ CHECK EMAIL
      // ===============================
      const checkRes = await apiFetch(`${SERVER_URL}/api/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const checkData = await checkRes.json();

      if (!checkRes.ok || !checkData.success) {
        setError(checkData.error || "Email is not authorized.");
        return;
      }

      const user = checkData.user;

      if (user.userStatus?.toLowerCase() !== "active") {
        setError("This account is not active.");
        return;
      }

      // optional (UI only)
      UserService.setPendingUser(user);

      // ===============================
      // 2️⃣ SEND OTP (SECURE)
      // ===============================
      const otpRes = await apiFetch(`${SERVER_URL}/api/sendOTP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress: email }),
      });

      if (!otpRes) return;

        // 🔥 HANDLE RATE LIMIT FIRST
        if (otpRes.status === 429) {
          const result = await otpRes.json();
          setError(result.message || "Too many requests. Please wait.");
          return;
        }

        const result = await otpRes.json();

        if (!otpRes.ok || !result.success) {
          setError(result.message || "Failed to send OTP.");
          return;
        }

      if (!otpRes.ok || !result.success) {
        setError(result.message || "Failed to send OTP.");
        return;
      }

      // ===============================
      // ✅ STORE SECURE DATA
      // ===============================
      localStorage.setItem("pendingChallengeId", result.challengeId);
      localStorage.setItem("pendingEmail", email);
      localStorage.setItem("pendingExpiryAt", result.expiresAt);
      localStorage.setItem("otpCooldownStart", Date.now());

      // ===============================
      // 3️⃣ GO TO OTP PAGE
      // ===============================
      navigate("/OTP-SECURE", {
        state: {
          emailAddress: email,
        },
      });

    } catch (err) {
      console.error("OTP login error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#061326]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="w-72 h-72 bg-[#00a1c9]/15 rounded-full blur-3xl absolute -top-16 -left-10" />
        <div className="w-72 h-72 bg-[#f58220]/10 rounded-full blur-3xl absolute bottom-0 right-0" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/10 border border-white/20 rounded-xl shadow px-10 py-7 text-white backdrop-blur-lg">

          <div className="flex flex-col items-center mb-6">
            <img src={logo} alt="Callmax Logo" className="w-60 mb-3" />
            <h2 className="text-xl font-semibold text-gray-300">
              Client Management Suite
            </h2>
            <p className="text-xs text-gray-200 mt-1">
              Version {APP_VERSION}
            </p>
          </div>

          <div className="mb-4">
            <label className="text-xs text-gray-300 mb-1 block">
              Email
            </label>

            <input
              type="email"
              placeholder="you@callmaxsolutions.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualOtpLogin();
              }}
              className="text-black w-full border rounded-lg px-3 py-2 text-sm text-center" 
            />
          </div>

          <button
            onClick={handleManualOtpLogin}
            disabled={isSending}
            className={`w-full py-2 text-sm rounded text-white transition-all duration-200 ${
              isSending
                ? "bg-gray-500 cursor-not-allowed"
                : "bg-[#0084a4] hover:bg-[#015368]"
            }`}
          >
            {isSending
              ? `Sending OTP via Secure Channel${dots}`
              : "Request OTP"}
          </button>

          {error && (
            <p className="text-red-500 text-xs mt-3 text-center bg-white p-1">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="absolute bottom-2 w-full text-center text-white text-[10px]">
        © 2025 CMX Client Management Suite v{APP_VERSION}
      </div>
    </div>
  );
};

export default OauthLogin;