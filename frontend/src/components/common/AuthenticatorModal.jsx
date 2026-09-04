import React, { useEffect, useRef, useState } from "react";

const METHODS = {
  otp: {
    label: "Email OTP",
    description: "Receive a one-time code by email at each sign-in.",
  },
  authenticator: {
    label: "Microsoft Authenticator",
    description: "Approve sign-ins with a code from the Authenticator app.",
  },
};

export default function AuthenticatorModal({
  isOpen,
  onClose,
  userEmail = "your account",
  preferredMethod = "otp",
  setupData = null,
  onStartSetup,
  onVerifySetup,
  onSavePreference,
}) {
  const dialogRef = useRef(null);
  const wasOpenRef = useRef(false);
  const [selectedMethod, setSelectedMethod] = useState(preferredMethod);
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState("choose");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return undefined;
    }

    if (!wasOpenRef.current) {
      setSelectedMethod(preferredMethod);
      setVerificationCode("");
      setStep("choose");
      setError("");
      setSuccess("");
      dialogRef.current?.focus();
      wasOpenRef.current = true;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, preferredMethod]);

  if (!isOpen) return null;

  const handleContinue = async () => {
    setError("");
    setSuccess("");

    if (selectedMethod === "otp") {
      setIsBusy(true);
      try {
        await onSavePreference?.("otp");
        setSuccess("Email OTP is now your preferred sign-in method.");
      } catch (err) {
        setError(err.message || "Unable to save your sign-in preference.");
      } finally {
        setIsBusy(false);
      }
      return;
    }

    setIsBusy(true);
    try {
      await onStartSetup?.();
      setStep("setup");
    } catch (err) {
      setError(err.message || "Unable to start Authenticator setup.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!setupData?.qrCodeUrl || !onVerifySetup) {
      setError("Authenticator setup is not available for this account yet.");
      return;
    }

    if (verificationCode.length !== 6) {
      setError("Enter the six-digit code shown in Microsoft Authenticator.");
      return;
    }

    setIsBusy(true);
    setError("");
    try {
      await onVerifySetup?.(verificationCode);
      await onSavePreference?.("authenticator");
      setSuccess("Microsoft Authenticator is connected to your account.");
      setStep("complete");
    } catch (err) {
      setError(err.message || "That code could not be verified.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#061326]/75 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="authenticator-modal-title"
        tabIndex={-1}
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white text-slate-800 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between bg-[#003b5c] px-6 py-5 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
              Account security
            </p>
            <h2
              id="authenticator-modal-title"
              className="mt-1 text-xl font-semibold"
            >
              Choose your sign-in method
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close security settings"
            className="rounded p-1 text-2xl leading-none text-white/75 hover:bg-white/10 hover:text-white"
          >
            &times;
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {step === "choose" && (
            <>
              <p className="text-sm leading-relaxed text-slate-600">
                Set how {userEmail} will verify future logins. You can change
                this preference later.
              </p>
              <div
                className="space-y-3"
                role="radiogroup"
                aria-label="Sign-in method"
              >
                {Object.entries(METHODS).map(([method, details]) => (
                  <button
                    key={method}
                    type="button"
                    role="radio"
                    aria-checked={selectedMethod === method}
                    onClick={() => setSelectedMethod(method)}
                    className={`w-full rounded-lg border p-4 text-left transition ${selectedMethod === method ? "border-cyan-600 bg-cyan-50 ring-2 ring-cyan-100" : "border-slate-200 hover:border-slate-400"}`}
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-slate-800">
                        {details.label}
                      </span>
                      <span
                        className={`h-4 w-4 rounded-full border-2 ${selectedMethod === method ? "border-cyan-600 bg-cyan-600 ring-2 ring-white" : "border-slate-300"}`}
                      />
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {details.description}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "setup" && (
            <>
              <div>
                <h3 className="font-semibold text-slate-900">
                  Connect Microsoft Authenticator
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Follow these steps to link {userEmail} to Microsoft
                  Authenticator.
                </p>
              </div>
              <ol className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-800">
                    1
                  </span>
                  <span>
                    Install <strong>Microsoft Authenticator</strong> from the
                    App Store or Google Play, then open it.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-800">
                    2
                  </span>
                  <span>
                    Tap <strong>+</strong>, choose{" "}
                    <strong>Other account</strong>, and allow camera access if
                    prompted.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-800">
                    3
                  </span>
                  <span>
                    Scan the QR code below. If you cannot scan it, choose the
                    manual entry option in the app and enter the setup key.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 font-semibold text-cyan-800">
                    4
                  </span>
                  <span>
                    Enter the six-digit code shown in the app to confirm the
                    connection.
                  </span>
                </li>
              </ol>
              {setupData?.qrCodeUrl ? (
                <div className="flex justify-center rounded-lg bg-slate-50 p-4">
                  <img
                    src={setupData.qrCodeUrl}
                    alt="Microsoft Authenticator setup QR code"
                    className="h-44 w-44"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  The QR code will appear here after setup is started.
                </div>
              )}
              {setupData?.secret && (
                <div className="rounded-lg bg-slate-100 p-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Manual setup key
                  </p>
                  <code className="mt-1 block break-all text-sm font-semibold text-slate-800">
                    {setupData.secret}
                  </code>
                </div>
              )}
              <form onSubmit={handleVerify} className="space-y-3">
                <label
                  htmlFor="authenticator-code"
                  className="block text-sm font-medium text-slate-700"
                >
                  Enter the six-digit code from the app
                </label>
                <input
                  id="authenticator-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\D/g, ""))
                  }
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-xl tracking-[0.45em] outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  placeholder="000000"
                />
                <button
                  type="submit"
                  disabled={isBusy || !setupData?.qrCodeUrl}
                  className="w-full rounded-lg bg-[#0084a4] px-4 py-3 font-semibold text-white hover:bg-[#006f8a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBusy ? "Verifying..." : "Verify and connect"}
                </button>
              </form>
            </>
          )}

          {step === "complete" && (
            <div className="py-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
                ✓
              </div>
              <p className="mt-4 font-semibold text-slate-900">
                Authenticator connected
              </p>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-emerald-700" role="status">
              {success}
            </p>
          )}

          {step === "choose" && (
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={isBusy}
                className="rounded-lg bg-[#0084a4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#006f8a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy
                  ? "Saving..."
                  : selectedMethod === "authenticator"
                    ? "Set up Authenticator"
                    : "Use email OTP"}
              </button>
            </div>
          )}
          {step === "complete" && (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-[#0084a4] px-4 py-3 font-semibold text-white hover:bg-[#006f8a]"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
