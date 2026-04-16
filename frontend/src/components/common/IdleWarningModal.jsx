import React from "react";

export default function IdleWarningModal({ show, timeLeft, onStay }) {
  if (!show) return null;

  const seconds = Math.floor(timeLeft / 1000);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-[90%] max-w-sm text-center">

        <h2 className="text-lg font-semibold text-[#003b5c] mb-3">
          ⚠️ Inactivity Detected
        </h2>

        <p className="text-gray-600 text-sm mb-4">
          You will be logged out due to inactivity in:
        </p>

        <p className="text-xl font-bold text-red-500 mb-6">
          {seconds}s
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