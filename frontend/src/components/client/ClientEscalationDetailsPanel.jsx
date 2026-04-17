import React, { useState } from "react";
import UpdateEscalationModal from "../client/UpdateEscalationModal";

const formatDate = (raw) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return isNaN(d)
    ? raw
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
};

const ClientEscalationDetailsPanel = ({ escalation, onReload }) => {
  const [activeTab, setActiveTab] = useState("Details");
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const handleUpdateClick = () => setShowUpdateModal(true);

  const handleSuccess = () => {
    setShowUpdateModal(false);
    onReload?.(); // Call parent reload
  };

  if (!escalation) {
    return (
      <aside className="flex-[1] min-w-[320px] max-w-[480px] border-l border-gray-200 bg-white/90 backdrop-blur-sm hidden lg:flex flex-col h-full">
        <div className="flex flex-col items-center justify-center text-center flex-1 px-4 text-gray-400 text-xs">
          <div className="w-9 h-9 rounded-full border border-dashed border-gray-300 flex items-center justify-center mb-2">
            ⚠️
          </div>
          <p className="font-medium text-gray-600">No escalation selected</p>
          <p className="text-[11px] mt-1">
            Click on an escalation to view full details.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside className="w-full border-l border-gray-200 bg-white/90 backdrop-blur-sm p-4 hidden lg:flex flex-col relative">
        {/* Header and Update Button */}
        <div className="mb-4 flex justify-between items-start">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {escalation.ACCOUNT}
            </h2>
            <p className="text-[11px] text-gray-500">
              {escalation.ACCOUNTCODE} · {escalation.TASK}
            </p>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#e0f7fd] text-[#003b5c] border border-[#00a1c9]/40">
                {escalation.STATUS || "No Status"}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700 border border-gray-200">
                {escalation.CRITICALITY || "Unspecified"}
              </span>
            </div>
          </div>

          <button
            onClick={handleUpdateClick}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors
              ${
                escalation.STATUS === "Closed"
                  ? "text-gray-600 border border-gray-300 hover:bg-gray-100"
                  : "text-[#00a1c9] border border-[#00a1c9] hover:bg-[#e0f7fd]"
              }`}
          >
            {escalation.STATUS === "Closed"
              ? "View Escalation"
              : "Update Escalation"}
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-100 mb-2 flex text-[11px]">
          {["Details", "Actions"].map((tab) => (
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto text-xs space-y-3 pr-2">
          {activeTab === "Details" && (
            <div className="space-y-3">
              <div>
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase">
                  Escalation Type
                </h3>
                <p>{escalation.ESCALATIONTYPE || "—"}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase">
                  Escalation Date
                </h3>
                <p>{formatDate(escalation.ESCALATION_DATE)}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase">
                  Details
                </h3>
                <p className="whitespace-pre-line">
                  {escalation.ESCALATIONDETAILS || "—"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-x-4">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">
                    OIC
                  </p>
                  <p>{escalation.OIC || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">
                    OIC Email
                  </p>
                  <p>{escalation.OIC_EMAIL || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">
                    Report Date
                  </p>
                  <p>{formatDate(escalation.REPORTSUBMITTEDDATE)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">
                    Resolved Date
                  </p>
                  <p>{formatDate(escalation.RESOLVEDDATE)}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Actions" && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase">
                Actions
              </h3>
              <p className="whitespace-pre-line text-xs">
                {escalation.ACTIONTAKEN || "No action details available."}
              </p>
            </div>
          )}

          {/* Attachment */}
          {escalation.attachmentUrl && (
            <a
              href={escalation.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-3 text-xs text-[#00a1c9] hover:underline"
            >
              📎 View Attachment
            </a>
          )}
        </div>
      </aside>

      {/* Modal */}
      {showUpdateModal && (
        <UpdateEscalationModal
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
          escalationData={escalation}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
};

export default ClientEscalationDetailsPanel;
