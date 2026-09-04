import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SERVER_URL } from "../lib/constants";
import logo from "../../assets/callmax_cover_removebg.png";
import pkg from "../../../package.json";
import { apiFetch } from "../lib/apiFetch";

const OauthLogin = () => {
  const navigate = useNavigate();
  const APP_VERSION = pkg.version;
  const GENERIC_AUTH_MESSAGE = "Invalid credentials or authentication request";
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [dots, setDots] = useState("");
  const [loginMethod, setLoginMethod] = useState("otp");

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

  const handleLogin = async () => {
    setError("");

    if (!email) {
      setError(GENERIC_AUTH_MESSAGE);
      return;
    }

    if (!isCallmaxEmail(email)) {
      setError(GENERIC_AUTH_MESSAGE);
      return;
    }

    setIsSending(true);

    try {
      if (loginMethod === "authenticator") {
        const mfaRes = await apiFetch(`${SERVER_URL}/api/mfa/login/start`, {
          method: "POST",
          body: JSON.stringify({ emailAddress: email }),
        });
        const result = mfaRes && (await mfaRes.json());

        if (!mfaRes?.ok || !result?.success) {
          setError(
            result?.code === "MFA_NOT_CONFIGURED"
              ? result.message
              : GENERIC_AUTH_MESSAGE,
          );
          return;
        }

        navigate("/MFA-SECURE", {
          state: { emailAddress: email },
        });
        return;
      }

      // ===============================
      // SEND OTP ONLY
      // Do not expose check-email result in frontend
      // ===============================
      const otpRes = await apiFetch(`${SERVER_URL}/api/sendOTP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress: email }),
      });

      if (!otpRes) {
        setError(GENERIC_AUTH_MESSAGE);
        return;
      }

      if (otpRes.status === 429) {
        setError(GENERIC_AUTH_MESSAGE);
        return;
      }

      const result = await otpRes.json();

      if (
        !otpRes.ok ||
        !result.success ||
        !result.challengeId ||
        !result.expiresAt
      ) {
        setError(GENERIC_AUTH_MESSAGE);
        return;
      }

      localStorage.setItem("pendingChallengeId", result.challengeId);
      localStorage.setItem("pendingEmail", email);
      localStorage.setItem("pendingExpiryAt", result.expiresAt);
      localStorage.setItem("otpCooldownStart", Date.now());

      navigate("/OTP-SECURE", {
        state: {
          emailAddress: email,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      setError(GENERIC_AUTH_MESSAGE);
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
            <p className="text-xs text-gray-200 mt-1">Version {APP_VERSION}</p>
          </div>

          <div className="mb-4">
            <label className="text-xs text-gray-300 mb-1 block">Email</label>

            <input
              type="email"
              placeholder="you@callmaxsolutions.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
              className="text-black w-full border rounded-lg px-3 py-2 text-sm text-center"
            />
          </div>

          <div
            className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-black/20 p-1"
            role="radiogroup"
            aria-label="Login method"
          >
            <button
              type="button"
              role="radio"
              aria-checked={loginMethod === "otp"}
              onClick={() => setLoginMethod("otp")}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition ${loginMethod === "otp" ? "bg-white text-[#003b5c]" : "text-white/75 hover:text-white"}`}
            >
              Email OTP
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={loginMethod === "authenticator"}
              onClick={() => setLoginMethod("authenticator")}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition ${loginMethod === "authenticator" ? "bg-white text-[#003b5c]" : "text-white/75 hover:text-white"}`}
            >
              Authenticator
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={isSending}
            className={`w-full py-2 text-sm rounded text-white transition-all duration-200 ${
              isSending
                ? "bg-gray-500 cursor-not-allowed"
                : "bg-[#0084a4] hover:bg-[#015368]"
            }`}
          >
            {isSending
              ? loginMethod === "otp"
                ? `Sending OTP via Secure Channel${dots}`
                : "Starting Authenticator sign-in..."
              : loginMethod === "otp"
                ? "Request OTP"
                : "Sign in with Authenticator"}
          </button>

          {error && (
            <p className="mt-3 text-center text-xs font-medium text-red-300">
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
