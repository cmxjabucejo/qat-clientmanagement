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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-xl shadow-lg p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-semibold text-gray-800">
            Survey Response Details
          </h2>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* CONTENT */}
        <div className="space-y-3 text-xs">

          <div><b>Month:</b> {getMonth(data.submitted_at)}</div>
          <div><b>Name:</b> {data.name}</div>
          <div><b>Company:</b> {data.company}</div>
          <div><b>Email:</b> {data.email}</div>

          <div>
            <b>Tasks:</b>
            <p className="mt-1 text-gray-700">{data.tasks}</p>
          </div>

          {/* ATTACHMENTS */}
          <div>
            <b>Attachments:</b>
            <div className="mt-1 space-y-1">
              {parseAttachments(data.attachment_files).length > 0 ? (
                parseAttachments(data.attachment_files).map((file, idx) => {
                  const fileName = file.split("/").pop();

                  return (
                    <div
                      key={idx}
                      className="flex justify-between bg-gray-50 px-2 py-1 rounded border"
                    >
                      <span className="truncate">📎 {fileName}</span>

                      <button
                        onClick={() => {
                          let key = file;

                          if (file.includes(".com/")) {
                            key = file.split(".com/")[1];
                          }

                          openAttachment(key);
                        }}
                        className="text-[#003b5c] hover:underline"
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

          {/* SCORES */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div><b>Satisfaction:</b> {data.satisfaction}</div>
            <div><b>Recommend:</b> {data.recommend}</div>
            <div><b>Communication:</b> {data.communication}</div>
            <div><b>Collaboration:</b> {data.collaboration}</div>
            <div><b>Consistency:</b> {data.consistency}</div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-[#003b5c] text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}