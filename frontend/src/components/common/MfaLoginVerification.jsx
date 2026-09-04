import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { SERVER_URL } from "../lib/constants";
import { apiFetch } from "../lib/apiFetch";

const MfaLoginVerification = () => {
  const location = useLocation();
  const codeRef = useRef(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const email = location.state?.emailAddress || "your account";

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Enter the six-digit code from Microsoft Authenticator.");
      return;
    }

    setError("");
    setIsVerifying(true);

    try {
      const response = await apiFetch(`${SERVER_URL}/api/mfa/login/verify`, {
        method: "POST",
        body: JSON.stringify({ token: code }),
      });
      const data = response && (await response.json());

      if (!response?.ok || !data?.success) {
        setError(
          data?.message || "Invalid credentials or authentication request",
        );
        return;
      }

      window.location.href = "/ClientEscalations";
    } catch (err) {
      console.error("MFA login error:", err);
      setError("Invalid credentials or authentication request");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#061326] px-4">
      <div className="w-full max-w-md rounded-xl border border-white/20 bg-white/10 px-8 py-8 text-white shadow backdrop-blur-lg">
        <h1 className="text-center text-xl font-semibold">
          Microsoft Authenticator
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-white/80">
          Open Microsoft Authenticator for {email} and enter the current
          six-digit code.
        </p>

        <label
          htmlFor="mfa-login-code"
          className="mt-6 block text-sm text-white/80"
        >
          Verification code
        </label>
        <input
          ref={codeRef}
          id="mfa-login-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, ""));
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleVerify();
          }}
          placeholder="000000"
          className="mt-2 w-full rounded-lg border border-white/20 bg-white px-3 py-3 text-center text-xl tracking-[0.45em] text-slate-900 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200"
        />

        {error && (
          <p className="mt-3 text-center text-xs font-medium text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying}
          className="mt-5 w-full rounded-lg bg-[#0084a4] py-3 text-sm font-semibold text-white hover:bg-[#015368] disabled:cursor-not-allowed disabled:bg-gray-500"
        >
          {isVerifying ? "Verifying..." : "Verify and sign in"}
        </button>
      </div>
    </div>
  );
};

export default MfaLoginVerification;
