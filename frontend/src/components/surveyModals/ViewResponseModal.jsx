import React from "react";

export default function ViewResponseModal({
  isOpen,
  onClose,
  data,
  getMonth,
  parseAttachments,
  openAttachment,
}) {
  if (!isOpen || !data) return null;

  const scoreBadge = (val) => {
    const v = Number(val);
    if (v >= 4) return "bg-blue-100 text-blue-700";
    if (v === 3) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const npsBadge = (val) => {
    const v = Number(val);
    if (v <= 6) return { label: "Detractor", style: "bg-red-100 text-red-700" };
    if (v <= 8) return { label: "Passive", style: "bg-yellow-100 text-yellow-700" };
    return { label: "Promoter", style: "bg-blue-100 text-blue-700" };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >

        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Survey Response
            </h2>
            <p className="text-[11px] text-gray-400">
              {getMonth(data.month)} • {data.company}
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">

          {/* OVERVIEW */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400 text-[10px]">Account</p>
              <p className="font-medium text-gray-800">{data.company}</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-gray-400 text-[10px]">Agent / Team</p>
              <p className="font-medium text-gray-800">{data.agent || "-"}</p>
            </div>
          </div>

          {/* RESPONDENT */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-600 mb-2">
              Respondent
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border rounded-xl p-3">
                <p className="text-gray-400 text-[10px]">Name</p>
                <p className="font-medium text-gray-800">{data.name}</p>
              </div>

              <div className="bg-white border rounded-xl p-3">
                <p className="text-gray-400 text-[10px]">Email</p>
                <p className="font-medium text-gray-800">{data.email}</p>
              </div>
            </div>
          </div>

          {/* TASKS */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-600 mb-2">
              Tasks / Feedback
            </h3>

            <div className="bg-gray-50 border rounded-xl p-3 text-gray-700 leading-relaxed">
              {data.tasks || "No input provided"}
            </div>
          </div>

          {/* SCORES */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-600 mb-2">
              Scores
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

              {/* NPS */}
              {(() => {
                const nps = npsBadge(data.recommend);
                return (
                  <div className="bg-white border rounded-xl p-3 text-center">
                    <p className="text-gray-400 text-[10px] mb-1">NPS</p>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] ${nps.style}`}>
                      {nps.label}
                    </span>
                  </div>
                );
              })()}

              {/* CSAT */}
              <div className="bg-white border rounded-xl p-3 text-center">
                <p className="text-gray-400 text-[10px] mb-1">CSAT</p>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${scoreBadge(data.satisfaction)}`}>
                  {data.satisfaction}
                </span>
              </div>

              {/* COMM */}
              <div className="bg-white border rounded-xl p-3 text-center">
                <p className="text-gray-400 text-[10px] mb-1">Communication</p>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${scoreBadge(data.communication)}`}>
                  {data.communication}
                </span>
              </div>

              {/* COLLAB */}
              <div className="bg-white border rounded-xl p-3 text-center">
                <p className="text-gray-400 text-[10px] mb-1">Collaboration</p>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${scoreBadge(data.collaboration)}`}>
                  {data.collaboration}
                </span>
              </div>

              {/* CONSISTENCY */}
              <div className="bg-white border rounded-xl p-3 text-center">
                <p className="text-gray-400 text-[10px] mb-1">Consistency</p>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${scoreBadge(data.consistency)}`}>
                  {data.consistency}
                </span>
              </div>

            </div>
          </div>

          {/* ATTACHMENTS */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-600 mb-2">
              Attachments
            </h3>

            <div className="space-y-2">
              {parseAttachments(data.attachment_files).length > 0 ? (
                parseAttachments(data.attachment_files).map((file, idx) => {
                  const fileName = file.split("/").pop();

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2"
                    >
                      <span className="truncate text-gray-700 text-[11px]">
                        📎 {fileName}
                      </span>

                      <button
                        onClick={() => {
                          let key = file;
                          if (file.includes(".com/")) {
                            key = file.split(".com/")[1];
                          }
                          openAttachment(key);
                        }}
                        className="text-[#003b5c] text-[11px] hover:underline"
                      >
                        Open
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-400 text-[11px]">No attachments</p>
              )}
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="border-t px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-[#003b5c] text-white rounded-lg hover:bg-[#002b45]"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}