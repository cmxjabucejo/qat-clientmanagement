import React, { useMemo, useState } from "react";
import { SERVER_URL } from "../lib/constants";
import { apiFetch } from "../lib/apiFetch";

const getLast3Months = () => {
  const now = new Date();
  const months = [];

  for (let i = 2; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);

    const year = d.getFullYear();
    const monthIndex = d.getMonth();

    const label = d.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    const shortMonth = d.toLocaleString("en-US", {
      month: "short",
    });

    const monthNumber = String(monthIndex + 1).padStart(2, "0");

    // 🔥 THIS IS WHAT YOU SAVE TO DB
    const value = `${year} (${monthNumber}) ${shortMonth}`;

    months.push({
      label, // February 2026
      value, // 2026 (02) Feb
    });
  }

  return months;
};

const INITIAL_EMAIL_FORM = {
  month: "",
  client: "",
  emailType: "",
  email: "",
  recipientName: "",
  agentName: "",
  notes: "",
};

export default function SendSurveyEmailModal({
  isOpen,
  onClose,
  clients = [],
  onSuccess,
  onError,
}) {
  const [emailForm, setEmailForm] = useState(INITIAL_EMAIL_FORM);
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState("idle");
  const [emailMessage, setEmailMessage] = useState("");

  const normalizedClients = useMemo(() => {
    return (clients || []).map((c) => ({
      label: (c.ClientList || "").toUpperCase(),
      value: c.ClientList || "",
    }));
  }, [clients]);

  const resetForm = () => {
    setEmailForm(INITIAL_EMAIL_FORM);
    setEmailError("");
    setEmailLoading(false);
  };

  const closeMainModal = () => {
    setEmailError("");
    onClose?.();
  };

  const handleEmailChange = (e) => {
    const { name, value } = e.target;

    setEmailForm((prev) => {
      const next = { ...prev, [name]: value };

      // clear recipient name if not individual
      if (name === "emailType" && value !== "individual") {
        next.recipientName = "";
      }

      return next;
    });

    if (emailError) setEmailError("");
  };

  const validateForm = () => {
    const missing = [];

    if (!emailForm.month) missing.push("Month");
    if (!emailForm.client) missing.push("Client");
    if (!emailForm.emailType) missing.push("Email Type");
    if (!emailForm.email) missing.push("Email");
    if (!emailForm.agentName) missing.push("Agent Name");

    if (
      emailForm.emailType === "individual" &&
      !emailForm.recipientName.trim()
    ) {
      missing.push("Recipient Name");
    }

    return missing;
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();

    const missing = validateForm();

    if (missing.length) {
      setEmailError(`Please fill required fields: ${missing.join(", ")}`);
      return;
    }

    setEmailError("");
    setEmailLoading(true);

    try {
      const res = await apiFetch(`${SERVER_URL}/api/send-survey-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailForm),
      });

      const data = await res.json();

      if (res.ok) {
        setEmailStatus("success");
        setEmailMessage(data.message || "Survey email sent successfully.");
        onSuccess?.(data, emailForm);
        onClose?.();
        resetForm();
      } else {
        setEmailStatus("error");
        setEmailMessage(data.message || "Failed to send email.");
        onError?.(data, emailForm);
        onClose?.();
      }
    } catch (err) {
      console.error("Error sending survey email:", err);
      setEmailStatus("error");
      setEmailMessage("Error sending email.");
      onError?.(err, emailForm);
      onClose?.();
    } finally {
      setEmailLoading(false);
    }
  };

  const closeResultModal = () => {
    setEmailStatus("idle");
    setEmailMessage("");
  };

  if (!isOpen && emailStatus === "idle") return null;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Send Survey Email
              </h2>

              <button
                type="button"
                onClick={closeMainModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {emailError && (
              <p className="mb-3 text-xs text-red-500">{emailError}</p>
            )}

            <form onSubmit={handleEmailSubmit} className="space-y-4 text-xs">
              <div>
                <label className="mb-1 block text-gray-700">
                  Month <span className="text-red-500">*</span>
                </label>
                <select
                  name="month"
                  value={emailForm.month}
                  onChange={handleEmailChange}
                  className="w-full rounded border px-2 py-1.5"
                >
                  <option value="">Select</option>

                  {getLast3Months().map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-gray-700">
                  Client <span className="text-red-500">*</span>
                </label>
                <select
                  name="client"
                  value={emailForm.client}
                  onChange={handleEmailChange}
                  className="w-full rounded border px-2 py-1.5"
                >
                  <option value="">Select</option>
                  {normalizedClients.map((c, i) => (
                    <option key={`${c.value}-${i}`} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-gray-700">
                  Email Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="emailType"
                  value={emailForm.emailType}
                  onChange={handleEmailChange}
                  className="w-full rounded border px-2 py-1.5"
                >
                  <option value="">Select</option>
                  <option value="individual">Individual</option>
                  <option value="distro">Distro</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-gray-700">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={emailForm.email}
                  onChange={handleEmailChange}
                  className="w-full rounded border px-2 py-1.5"
                />
              </div>

              {emailForm.emailType === "individual" && (
                <div>
                  <label className="mb-1 block text-gray-700">
                    Recipient Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="recipientName"
                    value={emailForm.recipientName}
                    onChange={handleEmailChange}
                    className="w-full rounded border px-2 py-1.5"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-gray-700">
                  Agent / Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="agentName"
                  value={emailForm.agentName}
                  onChange={handleEmailChange}
                  className="w-full rounded border px-2 py-1.5"
                />
              </div>

              {/* <div>
                <label className="mb-1 block text-gray-700">Notes</label>
                <textarea
                  name="notes"
                  value={emailForm.notes}
                  onChange={handleEmailChange}
                  rows={3}
                  placeholder="Enter any additional notes..."
                  className="w-full rounded border px-2 py-1.5"
                />
              </div> */}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeMainModal}
                  className="rounded bg-gray-300 px-3 py-1"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={emailLoading}
                  className={`rounded px-4 py-1.5 text-white ${
                    emailLoading
                      ? "bg-gray-300"
                      : "bg-[#003b5c] hover:bg-[#002a40]"
                  }`}
                >
                  {emailLoading ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {emailStatus !== "idle" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  emailStatus === "success" ? "bg-emerald-100" : "bg-red-100"
                }`}
              >
                {emailStatus === "success" ? (
                  <span className="text-lg text-emerald-700 animate-bounce">
                    ✔
                  </span>
                ) : (
                  <span className="text-lg text-red-700 animate-shake">!</span>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {emailStatus === "success"
                    ? "Email Sent Successfully"
                    : "Email Sending Failed"}
                </h3>

                <p className="mt-0.5 text-[11px] text-gray-600">
                  {emailMessage}
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeResultModal}
                className={`h-8 rounded-lg px-4 text-[11px] font-medium ${
                  emailStatus === "success"
                    ? "bg-[#003b5c] text-white hover:bg-[#002a40]"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {emailStatus === "success" ? "Close" : "Back"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
