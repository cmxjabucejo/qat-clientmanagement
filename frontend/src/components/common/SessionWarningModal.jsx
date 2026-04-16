import React from "react";

export default function SessionWarningModal({ show, timeLeft, onStay }) {
  if (!show) return null;

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-[90%] max-w-sm text-center">

        <h2 className="text-lg font-semibold text-[#003b5c] mb-3">
          ⏳ Session Expiring Soon
        </h2>

        <p className="text-gray-600 text-sm mb-4">
          Your session will expire in:
        </p>

        <p className="text-xl font-bold text-red-500 mb-6">
          {minutes}:{seconds.toString().padStart(2, "0")}
        </p>

        <button
          onClick={onStay}
          className="w-full bg-[#003b5c] text-white py-2 rounded hover:bg-[#005a8c]"
        >
          Stay Logged In
        </button>
      </div>
    </div>
  );
}