import React, { useState, useEffect } from "react";
import axios from "axios";
import { SERVER_URL } from "../lib/constants";

axios.defaults.withCredentials = true;

const formatDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const UpdateEscalationModal = ({
  isOpen,
  onClose,
  escalationData,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({});
  const [oicOptions, setOicOptions] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const email = localStorage.getItem("userEmail");

        if (!email) return;

        const res = await axios.post(
          `${SERVER_URL}/api/check-email`,
          { email },
        );

        if (res.data?.success) {
          const role = res.data.user.userLevel || "";

          if (role.toLowerCase().includes("admin")) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        }
      } catch (err) {
        console.error("Failed to verify user role", err);
      }
    };

    checkUserRole();
  }, []);

  const handleResultAction = () => {
    if (submitStatus === "success") {
      onSuccess?.();
      onClose();
    } else {
      setSubmitStatus("idle");
    }
  };

  const isClosed = escalationData?.STATUS === "Closed";

  useEffect(() => {
    if (!isOpen) return;

    const storedUserName = localStorage.getItem("name");
    setUserName(storedUserName);

    setFormData({
      escalationID: escalationData.ESCALATIONID,
      escalationDate: formatDate(escalationData.ESCALATION_DATE),
      account: escalationData.ACCOUNT,
      lob: escalationData.LOB,
      task: escalationData.TASK,
      site: escalationData.SITE,
      oic: escalationData.OIC,
      oicEmail: escalationData.OIC_EMAIL || "",
      clientCategory: escalationData.CLIENTCATEGORY,
      escalationType: escalationData.ESCALATIONTYPE,
      escalationDetails: escalationData.ESCALATIONDETAILS,
      validity: escalationData.VALIDITY,
      criticality: escalationData.CRITICALITY,
      reportSubmitted: escalationData.REPORTSUBMITTED,
      reportSubmittedDate: formatDate(escalationData.REPORTSUBMITTEDDATE),
      status: escalationData.STATUS,
      resolvedDate: formatDate(escalationData.RESOLVEDDATE),
      accountCode: escalationData.ACCOUNTCODE,
      actionTaken: escalationData.ACTIONTAKEN,
      resolutionStatus: escalationData.RESOLUTIONSTATUS,
      attachment: escalationData.ATTACHMENT,
    });

    try {
      const parsed = JSON.parse(escalationData.ATTACHMENT || "[]");
      setAttachments(Array.isArray(parsed) ? parsed : []);
    } catch {
      setAttachments([]);
    }

    setAttachmentUrl(escalationData.attachmentUrl || "");
  }, [isOpen, escalationData]);

  useEffect(() => {
    const fetchOIC = async () => {
      try {
        const res = await axios.get(`${SERVER_URL}/api/oicList`, {
        });

        setOicOptions(res.data || []);
      } catch (err) {
        console.error("OIC fetch failed:", err);

        if (err.response?.status === 401) {
          console.warn("Session expired while loading modal");
        }
      }
    };

    fetchOIC();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };

      if (name === "oic") {
        const selected = oicOptions.find((o) => o.EMPNAME === value);
        updated.oicEmail = selected?.EMAIL || "";
      }

      if (name === "resolutionStatus" && value !== "Pending") {
        updated.status = "Closed";
      }

      if (name === "reportSubmitted" && value !== "Yes") {
        updated.reportSubmittedDate = "";
      }

      return updated;
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    if (file) {
      setFormData((prev) => ({ ...prev, attachment: file.name }));
    }
  };

  const validateForm = () => {
    const required = [];

    if (formData.status === "Closed") {
      if (!formData.validity) required.push("Validity");
      if (!formData.reportSubmitted) required.push("Report Submitted");
      if (formData.reportSubmitted === "Yes" && !formData.reportSubmittedDate) {
        required.push("Report Submitted Date");
      }
      if (!formData.resolvedDate) required.push("Resolved Date");
      if (!formData.actionTaken) required.push("Action Taken");
    }

    if (required.length) {
      setError(`Please fill required fields: ${required.join(", ")}`);
      return false;
    }

    setError("");
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    const now = new Date();
    const formattedNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

    const updatedForm = {
      ...formData,
      dateLastUpdated: formattedNow,
    };

    const formToSend = new FormData();

    Object.entries(updatedForm).forEach(([key, val]) => {
      formToSend.append(key, val || "");
    });

    // ✅ EXISTING FILES
    formToSend.append("attachment", JSON.stringify(attachments));

    // ✅ NEW FILES
    if (selectedFile && selectedFile.length > 0) {
      selectedFile.forEach((file) => {
        formToSend.append("files", file);
      });
    }

    formToSend.append("userName", userName);

    try {
      const res = await axios.post(
        `${SERVER_URL}/api/updateEscalationInfo`,
        formToSend,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      if (res.data?.success) {
        setSubmitStatus("success");
        setSubmitMessage("Escalation has been successfully updated.");
      } else {
        setSubmitStatus("error");
        setSubmitMessage("Failed to update escalation.");
      }
    } catch (err) {
      console.error("Update failed:", err);
      setSubmitStatus("error");
      setSubmitMessage("Failed to update escalation. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-lg p-6 relative">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">
          Escalation Details
        </h2>

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-2 gap-4 text-xs"
        >
          <div>
            <label>Escalation ID</label>
            <input
              value={formData.escalationID}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={formData.escalationDate}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label>Account</label>
            <input
              value={formData.account}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label>LOB</label>
            <input
              value={formData.lob}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label>Task</label>
            <input
              value={formData.task}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label>Site</label>
            <input
              value={formData.site}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label>Escalation Type</label>
            <input
              value={formData.escalationType}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label>Criticality</label>
            <input
              value={formData.criticality}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label>Client Category</label>
            <input
              value={formData.clientCategory}
              readOnly
              className="w-full bg-gray-100 border rounded px-2 py-1.5"
            />
          </div>
          <div>
            <label>OIC</label>
            <select
              name="oic"
              value={formData.oic}
              onChange={handleChange}
              disabled={isClosed}
              className="w-full border rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              {oicOptions.map((o) => (
                <option key={o.ID} value={o.EMPNAME}>
                  {o.EMPNAME}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-3">
            <label>Escalation Details</label>
            <textarea
              name="escalationDetails"
              rows={3}
              value={formData.escalationDetails}
              onChange={handleChange}
              className="w-full border rounded px-2 py-1.5"
              disabled
            />
          </div>

          <div className="col-span-3 flex gap-4">
            <div className="w-1/3">
              <label>Validity</label>
              <select
                name="validity"
                value={formData.validity}
                onChange={handleChange}
                className="w-full border rounded px-2 py-1.5"
                disabled={isClosed}
              >
                <option value="">Select</option>
                <option>Valid</option>
                <option>Invalid</option>
              </select>
            </div>

            {/* Report Submitted */}
            <div className="w-1/3">
              <label>Report Submitted</label>
              <select
                name="reportSubmitted"
                value={formData.reportSubmitted || ""}
                onChange={handleChange}
                className="w-full border rounded px-2 py-1.5"
                disabled={isClosed}
              >
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>

            <div className="w-1/3">
              <label>
                Report Submitted Date
                {formData.reportSubmitted === "Yes" && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>
              <input
                type="date"
                name="reportSubmittedDate"
                value={formData.reportSubmittedDate || ""}
                onChange={handleChange}
                className="w-full border rounded px-2 py-1.5"
                disabled={isClosed || formData.reportSubmitted !== "Yes"}
                required={formData.reportSubmitted === "Yes"}
              />
            </div>
          </div>

          <div className="col-span-3">
            <label>
              Actions Taken
              {formData.status === "Closed" && (
                <span className="text-red-500 ml-0.5">*</span>
              )}
            </label>
            <textarea
              name="actionTaken"
              rows={3}
              value={formData.actionTaken}
              onChange={handleChange}
              className="w-full border rounded px-2 py-1.5"
              disabled={isClosed}
              required={formData.status === "Closed"}
            />
          </div>

          <div className="col-span-3 flex gap-4">
            <div className="w-1/3">
              <label>Resolution Status</label>
              <select
                name="resolutionStatus"
                value={formData.resolutionStatus}
                onChange={handleChange}
                className="w-full border rounded px-2 py-1.5"
                disabled={isClosed}
              >
                <option>Pending</option>
                <option>Resolved</option>
                <option>Unresolved</option>
              </select>
            </div>

            <div className="w-1/3">
              <label>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full border rounded px-2 py-1.5"
                disabled={isClosed || !isAdmin}
              >
                <option>Open</option>
                <option>Closed</option>
              </select>
            </div>

            <div className="w-1/3">
              <label>
                Date Closed
                {formData.status === "Closed" && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>
              <input
                type="date"
                name="resolvedDate"
                value={formData.resolvedDate}
                onChange={handleChange}
                className="w-full border rounded px-2 py-1.5"
                disabled={isClosed || formData.status !== "Closed"}
                required={formData.status === "Closed"}
              />
            </div>
          </div>

          <div className="col-span-2 space-y-1">
            <label className="block">Attachment</label>

            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((file, idx) => (
                  <div key={idx}>
                    <a
                      href={`${SERVER_URL}/api/get-file?key=${file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-xs"
                    >
                      📎 {file.split("/").pop()}
                    </a>
                  </div>
                ))}
              </div>
            )}

            <input
              type="file"
              multiple
              onChange={(e) => setSelectedFile(Array.from(e.target.files))}
              disabled={isClosed}
              className="mt-1"
            />
          </div>

          <div className="col-span-3 flex justify-end gap-2 mt-4">
            <button
              onClick={onClose}
              type="button"
              className="px-3 py-1 bg-gray-300 rounded"
            >
              Close
            </button>
            {!isClosed && (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium rounded bg-[#00a1c9] text-white hover:bg-[#008bb1]"
              >
                {saving ? "Updating..." : "Update"}
              </button>
            )}
          </div>
        </form>

        {/* ✅ Result Modal */}
        {submitStatus !== "idle" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    submitStatus === "success" ? "bg-emerald-100" : "bg-red-100"
                  }`}
                >
                  {submitStatus === "success" ? (
                    <span className="text-lg text-emerald-700 animate-bounce">
                      ✔
                    </span>
                  ) : (
                    <span className="text-lg text-red-700 animate-[shake_0.3s_ease-in-out_2]">
                      !
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {submitStatus === "success"
                      ? "Update Successful"
                      : "Update Failed"}
                  </h3>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {submitMessage}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleResultAction}
                  className={`h-8 px-4 rounded-lg text-[11px] font-medium ${
                    submitStatus === "success"
                      ? "bg-[#003b5c] text-white hover:bg-[#002a40]"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {submitStatus === "success" ? "Close" : "Back"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateEscalationModal;
