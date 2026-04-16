import React from "react";

export default function SessionExpiredModal({ show, onLogin }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-[90%] max-w-sm text-center">

        <h2 className="text-xl font-semibold text-[#003b5c] mb-3">
          🔒 Session Expired
        </h2>

        <p className="text-gray-600 text-sm mb-6">
          Your session has expired for security reasons.
          Please log in again to continue.
        </p>

        <button
          onClick={onLogin}
          className="w-full bg-[#003b5c] text-white py-2 rounded hover:bg-[#005a8c] transition"
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}