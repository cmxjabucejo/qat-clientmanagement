// src/components/client/ClientDetailsPanel.jsx
import React, { useState } from "react";
import { SERVER_URL } from "../lib/constants";



const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") return "$0";
  const num = Number(value) || 0;
  return `$${num.toLocaleString()}`;
};

const getOtherFees = (client) => {
  const extra = Number(client.EXTRAMONITORFEEPERUNIT) || 0;
  const phone = Number(client.PHONELINEFEEPERFTEPERMONTH) || 0;
  return extra + phone;
};

const ClientDetailsPanel = ({ client, onNotesUpdated, onEditAsNew }) => {
  const [activeTab, setActiveTab] = useState("Profile");

  // Add Notes modal state
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

  if (!client) {
    return (
      <aside className="w-80 border-l border-gray-200 bg-white/90 backdrop-blur-sm p-4 hidden lg:flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 text-gray-400 text-xs">
          <div className="w-9 h-9 rounded-full border border-dashed border-gray-300 flex items-center justify-center mb-2">
            📋
          </div>
          <p className="font-medium text-gray-600">No client selected</p>
          <p className="text-[11px] mt-1">
            Click on a client from the roster to view details, billing, and notes.
          </p>
        </div>
      </aside>
    );
  }

  const totalHeadcount = (client.PHFTE || 0) + (client.DRFTE || 0);
  const depositWaived =
    String(client.DEPOSITFEEWAIVED || "").toLowerCase() === "yes";
  const setupWaived =
    String(client.SETUPFEEWAIVED || "").toLowerCase() === "yes";

  const openNotesModal = () => {
    setNoteText("");
    setNoteError("");
    setShowNotesModal(true);
  };

  const closeNotesModal = () => {
    if (savingNote) return;
    setShowNotesModal(false);
    setNoteError("");
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      setNoteError("Please enter a note before saving.");
      return;
    }

    try {
      setSavingNote(true);
      setNoteError("");

      const userFirstName =
        localStorage.getItem("userFirstname") ||
        localStorage.getItem("firstName") ||
        "";
      const userLastName =
        localStorage.getItem("userLastname") ||
        localStorage.getItem("lastName") ||
        "";

      const res = await fetch(
        `${SERVER_URL}/api/client-roster/${client.ID}/notes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: noteText,
            userFirstName,
            userLastName,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save note.");
      }

      // Update parent state so NOTES tab reflects immediately
      if (onNotesUpdated) {
        onNotesUpdated(client.ID, data.notes);
      }

      setShowNotesModal(false);
      setNoteText("");
    } catch (err) {
      setNoteError(err.message || "Error saving note.");
    } finally {
      setSavingNote(false);
    }
  };

  const openAttachment = async (file) => {
    try {
      let key = file;

      // 🔹 handle old data (full S3 URL)
      if (file.includes(".com/")) {
        key = file.split(".com/")[1];
      }

      const res = await fetch(
        `${SERVER_URL}/api/client-attachment?key=${encodeURIComponent(key)}`
      );

      const data = await res.json();

      if (data.success && data.url) {
        window.open(data.url, "_blank");
      } else {
        alert("Failed to open file");
      }
    } catch (err) {
      console.error("Attachment error:", err);
    }
  };
  

  return (
    <aside className="w-80 border-l border-gray-200 bg-white/90 backdrop-blur-sm p-4 hidden lg:flex flex-col">
      {/* Header: name + tags */}
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">
          {client.ACCOUNT}
        </h2>
        <p className="text-[11px] text-gray-500">
          {client.ACCOUNTCODE} · {client.TASK}
        </p>
        <div className="mt-2 flex gap-1.5 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#e0f7fd] text-[#003b5c] border border-[#00a1c9]/40">
            {client.STATUS || "Status N/A"}
          </span>
          {client.STAFFINGMODEL && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700 border border-gray-200">
              {client.STAFFINGMODEL}
            </span>
          )}
        </div>
      </div>

      {/* Quick metric cards */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Seats</p>
          <p className="text-sm font-semibold text-gray-900">
            {totalHeadcount}
          </p>
          <p className="text-[11px] text-gray-500">
            PH: {client.PHFTE || 0} · DR: {client.DRFTE || 0}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase mb-1">Billing</p>
          <p className="text-sm font-semibold text-[#00a1c9]">
            {client.BILLINGCYCLE || "N/A"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 mb-2 flex text-[11px]">
        {["Profile", "Billing Info", "Notes"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[#003b5c] text-[#003b5c] font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto text-xs space-y-3">
      {/* PROFILE TAB */}
      {activeTab === "Profile" && (
        <div className="space-y-4">

          {/* Business Address */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase">
              Business Address
            </p>
            <p className="mt-1 text-gray-800 whitespace-pre-line">
              {client.BUSADDRESS || "No address on file"}
              {client.STATE && `\n${client.STATE}`}
            </p>
          </div>

          {/* Contacts */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase">
              Contacts
            </p>
            <div className="mt-1 space-y-1.5">
              {client.CONTACT1 && (
                <div>
                  <p className="text-gray-800">{client.CONTACT1}</p>
                  <p className="text-[11px] text-gray-500">
                    {client.CONTACTNO1 || "No contact number"}
                  </p>
                </div>
              )}

              {client.CONTACT2 && (
                <div className="pt-1 border-t border-dashed border-gray-200">
                  <p className="text-gray-800">{client.CONTACT2}</p>
                  <p className="text-[11px] text-gray-500">
                    {client.CONTACTNO2 || "No contact number"}
                  </p>
                </div>
              )}

              {!client.CONTACT1 && !client.CONTACT2 && (
                <p className="text-[11px] text-gray-500">
                  No contacts on file.
                </p>
              )}
            </div>
          </div>

          {/* Key Dates / Status / Salesperson */}
          <div className="grid grid-cols-2 gap-y-2 gap-x-6">
            <div>
              <span className="block text-[10px] uppercase text-gray-500">
                MSA Date
              </span>
              <span className="text-xs">{formatDate(client.MSA_DATE)}</span>
            </div>

            <div>
              <span className="block text-[10px] uppercase text-gray-500">
                Live Date
              </span>
              <span className="text-xs">{formatDate(client.LIVE_DATE)}</span>
            </div>

            <div>
              <span className="block text-[10px] uppercase text-gray-500">
                Salesperson
              </span>
              <span className="text-xs">{client.SALESPERSON || "—"}</span>
            </div>

            <div>
              <span className="block text-[10px] uppercase text-gray-500">
                Status
              </span>
              <span className="text-xs">{client.STATUS || "—"}</span>
            </div>

            <div>
              <span className="block text-[10px] uppercase text-gray-500">
                Termination Date
              </span>
              <span className="text-xs">
                {client.TERMINATIONDATE
                  ? formatDate(client.TERMINATIONDATE)
                  : "—"}
              </span>
            </div>
          </div>

          {/* Special Instructions */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase">
              Special Instructions
            </p>
            <p className="mt-1 text-[11px] text-gray-700 whitespace-pre-line">
              {client.SPECIAL_INSTRUCTIONS || "No special instructions."}
            </p>
          </div>

          {/* Attachments */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase">
              Attachments
            </p>

            <div className="mt-1 space-y-2">
              {Array.isArray(client.ATTACHMENTS) &&
              client.ATTACHMENTS.length > 0 ? (
                client.ATTACHMENTS.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded border border-gray-200"
                  >
                    <span
                      className="text-[11px] text-gray-700 truncate"
                      title={file?.name}
                    >
                      📎 {file?.name || "Unnamed file"}
                    </span>

                    {file?.url && (
                      <button
                        onClick={() => openAttachment(file.url)}
                        className="text-[10px] text-[#003b5c] hover:underline ml-2"
                      >
                        Open
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-gray-400">
                  No attachments available
                </p>
              )}
            </div>
          </div>

        </div>
      )}

        {/* BILLING INFO TAB */}
        {activeTab === "Billing Info" && (
          <div className="space-y-4">
            {/* Staffing & Billing */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase text-gray-500">
                  Staffing Model
                </p>
                <p className="text-xs">
                  {client.STAFFINGMODEL || "No Info on File"}
                </p>
              </div>
            </div>

            {/* Rates */}
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                Rates
              </p>
              <p className="text-[11px] text-gray-700">
                <span className="font-medium">Regular Rate: </span>
                {formatCurrency(client.REGULARRATE)}
              </p>
              <p className="text-[11px] text-gray-700">
                <span className="font-medium">Premium Rate: </span>
                {formatCurrency(client.PREMIUMRATE)}
              </p>
            </div>

            {/* Deposit & Setup */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase text-gray-500">
                  Deposit Fee
                </p>
                <p className="text-xs">
                  {depositWaived
                    ? "Waived"
                    : formatCurrency(client.DEPOSITFEE)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-500">
                  Setup Fee
                </p>
                <p className="text-xs">
                  {setupWaived ? "Waived" : formatCurrency(client.SETUPFEE)}
                </p>
              </div>
            </div>

            {/* Other Fees */}
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
                Other Fees
              </p>
              <p className="text-[11px] text-gray-700">
                {formatCurrency(getOtherFees(client))}{" "}
                <span className="text-gray-500">
                  (Extra Monitor + Phone Line per FTE / month)
                </span>
              </p>
            </div>
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab === "Notes" && (
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase">
              Notes
            </p>
            <p className="mt-1 text-[11px] text-gray-600 whitespace-pre-line">
              {client.NOTES || "No notes yet."}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-3 flex gap-2">
        <button
         onClick={() => onEditAsNew && onEditAsNew()}
         className="flex-1 h-8 text-xs rounded-lg border border-[#00a1c9] text-[#00a1c9] font-medium 
                    hover:bg-cyan-500 hover:text-white transition-colors"
        >
          Edit Client Record
        </button>

        {/* Show Add Notes ONLY on Notes tab */}
        {activeTab === "Notes" && (
          <button
            onClick={openNotesModal}
            className="flex-1 h-8 text-xs rounded-lg border border-[#00a1c9] text-[#00a1c9] font-medium 
                      hover:bg-cyan-500 hover:text-white transition-colors"
          >
            Add Notes
          </button>
        )}
      </div>

      {/* Add Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 text-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Add Note
                </h3>
                <p className="text-[11px] text-gray-500">
                  This will be appended to the client&apos;s Notes history.
                </p>
              </div>
              <button
                type="button"
                onClick={closeNotesModal}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <textarea
              rows={5}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs mb-2"
              placeholder="Type your note here..."
            />

            {noteError && (
              <p className="text-[11px] text-red-500 mb-2">{noteError}</p>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={closeNotesModal}
                disabled={savingNote}
                className="h-8 px-3 rounded-lg border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={savingNote || !noteText.trim()}
                className={`h-8 px-4 rounded-lg text-[11px] font-medium flex items-center gap-2
                  ${
                    savingNote || !noteText.trim()
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-[#003b5c] text-white hover:bg-[#002a40]"
                  }`}
              >
                {savingNote && (
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                )}
                {savingNote ? "Saving..." : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default ClientDetailsPanel;
