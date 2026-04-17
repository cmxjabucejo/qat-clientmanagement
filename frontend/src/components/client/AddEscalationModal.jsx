import React, { useState, useEffect } from "react";
import axios from "axios";
import { SERVER_URL } from "../lib/constants";

axios.defaults.withCredentials = true;

const AddEscalationModal = ({ isOpen, onClose, onSuccess }) => {
  const [accounts, setAccounts] = useState([]);
  const [oicOptions, setOicOptions] = useState([]);
  const [lobOptions, setLobOptions] = useState([]);
  const [taskOptions, setTaskOptions] = useState([]);

  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(Date.now());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [maxId, setMaxId] = useState(1);

  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const initialForm = {
    escalationID: "",
    escalationDate: new Date().toISOString().split("T")[0],
    account: "",
    lob: "",
    task: "",
    site: "",
    escalationType: "",
    criticality: "",
    status: "Open",
    escalationDetails: "",
    oic: "",
    oicEmail: "",
    accountCode: "",
    clientCategory: "",
  };

  const [formData, setFormData] = useState(initialForm);

  const resetForm = () => {
    setFormData(initialForm);
    setFiles([]);
    setFileKey(Date.now()); // 🔥 reset file input
    setLobOptions([]);
    setTaskOptions([]);
  };

  const handleResultAction = () => {
    if (submitStatus === "success") {
      resetForm();
      onSuccess?.();
      onClose();
    } else {
      setSubmitStatus("idle"); // go back to form
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    resetForm();
    setSubmitStatus("idle");
    setSubmitMessage("");
    setError("");
    setSaving(false);

    const loadFormData = async () => {
      try {
        const [oicRes, accRes, idRes] = await Promise.all([
          axios.get(`${SERVER_URL}/api/oicList`),
          axios.get(`${SERVER_URL}/api/accountDetails`),
          axios.get(`${SERVER_URL}/api/escalMaxId`),
        ]);

        setOicOptions(oicRes.data || []);
        setAccounts(accRes.data || []);
        setMaxId(idRes.data?.maxId || 0);
      } catch (err) {
        console.error("Failed to load form data", err);
        setError("Failed to load form data.");
      }
    };

    loadFormData();
  }, [isOpen]);

  const normalizeAccount = (acc) =>
    acc?.trim().replace(/\s+/g, " ").toUpperCase();

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...formData, [name]: value };

    if (name === "oic") {
      const found = oicOptions.find((o) => o.EMPNAME === value);
      if (found) updated.oicEmail = found.EMAIL;
    }

    setFormData(updated);
  };

  useEffect(() => {
    if (!formData.account || accounts.length === 0) return;

    const filteredLobs = accounts
      .filter(
        (a) =>
          normalizeAccount(a.ACCOUNT) === normalizeAccount(formData.account)
      )
      .map((a) => a.LOB)
      .filter((lob, i, self) => lob && self.indexOf(lob) === i);

    setLobOptions(filteredLobs);

    setFormData((prev) => ({
      ...prev,
      lob: "",
      task: "",
      site: "",
      accountCode: "",
    }));
  }, [formData.account, accounts]);

  useEffect(() => {
    if (!formData.lob || accounts.length === 0) return;

    const filteredTasks = accounts
      .filter(
        (a) =>
          normalizeAccount(a.ACCOUNT) === normalizeAccount(formData.account) &&
          a.LOB === formData.lob
      )
      .map((a) => a.TASK)
      .filter((task, i, self) => task && self.indexOf(task) === i);

    setTaskOptions(filteredTasks);

    setFormData((prev) => ({
      ...prev,
      task: "",
      site: "",
      accountCode: "",
    }));
  }, [formData.lob, accounts]);


  useEffect(() => {
    if (!formData.account || !formData.lob || !formData.task) return;

    const matched = accounts.find(
      (a) =>
        normalizeAccount(a.ACCOUNT) === normalizeAccount(formData.account) &&
        a.LOB === formData.lob &&
        a.TASK === formData.task
    );

    if (matched) {
      setFormData((prev) => ({
        ...prev,
        site: matched.SITE || "",
        accountCode: matched.ACCOUNTCODE || "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        site: "",
        accountCode: "",
      }));
    }
  }, [formData.account, formData.lob, formData.task, accounts]);



  useEffect(() => {
    const { site, account, task, escalationDate } = formData;

    if (!site || !account || !task || !escalationDate || !maxId) return;

    const sitePrefix = site.substring(0, 2).toUpperCase();
    const accountPrefix = account.substring(0, 1).toUpperCase();
    const taskPrefix = task.substring(0, 2).toUpperCase();

    const [year, month] = escalationDate.split("-");
    const yearShort = year.substring(2);

    const formattedId = String(maxId + 1).padStart(3, "0");

    const generatedId = `${sitePrefix}-${accountPrefix}${taskPrefix}-${yearShort}${month}-${formattedId}`;

    setFormData((prev) => ({
      ...prev,
      escalationID: generatedId,
    }));
  }, [
    formData.site,
    formData.account,
    formData.task,
    formData.escalationDate,
    maxId,
  ]);


  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);

    const allowed = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    const validFiles = selectedFiles.filter((file) => {
      const ext = file.name.toLowerCase().split(".").pop();
      return (
        allowed.includes(file.type) ||
        ["docx", "xlsx"].includes(ext)
      );
    });

    if (validFiles.length !== selectedFiles.length) {
      alert("Some files were skipped. Only PNG, JPG, PDF, DOCX, XLSX allowed.");
    }

    setFiles(validFiles);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const requiredFields = [
      "escalationDate",
      "clientCategory",
      "account",
      "lob",
      "task",
      "site",
      "escalationType",
      "criticality",
      "escalationDetails",
      "oic",
    ];

    const missing = requiredFields.filter((f) => !formData[f]);

    if (missing.length > 0) {
      setError("Please fill out all required fields.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const submission = new FormData();

      Object.entries(formData).forEach(([key, value]) => {
        submission.append(key, value || "");
      });

      files.forEach((file) => {
        submission.append("files", file);
      });

      const res = await axios.post(
        `${SERVER_URL}/api/add-escalation`,
        submission
      );

    if (res.data.success) {
      setSubmitStatus("success");
      setSubmitMessage("Escalation successfully saved.");
    } else {
      setSubmitStatus("error");
      setSubmitMessage("Submission failed. Please try again.");
    }
    } catch (err) {
      console.error("Error submitting escalation:", err);

      setSaving(false); // 🔥 ADD THIS HERE (important)

      setSubmitStatus("error");
      setSubmitMessage(
        err.response?.data?.error || "Submission failed. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl p-6 relative">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">
          Add New Escalation
        </h2>

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 text-xs">

          <div>
            <label className="block mb-1 font-medium">Escalation ID</label>
            <input
              type="text"
              name="escalationID"
              value={formData.escalationID}
              readOnly
              className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Date *</label>
            <input
              type="date"
              name="escalationDate"
              value={formData.escalationDate}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Client Category *</label>
            <select
              name="clientCategory"
              value={formData.clientCategory}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              <option>Assembly</option>
              <option>Non Assembly</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Account *</label>
            <select
              name="account"
              value={formData.account}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              {[...new Set(accounts.map((a) => normalizeAccount(a.ACCOUNT)))]
                .sort()
                .map((acc) => (
                <option key={acc} value={normalizeAccount(acc)}>
                  {acc}
                </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">LOB *</label>
            <select
              name="lob"
              value={formData.lob}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              {lobOptions.map((lob) => (
                <option key={lob}>{lob}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Task *</label>
            <select
              name="task"
              value={formData.task}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              {taskOptions.map((task) => (
                <option key={task}>{task}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Site *</label>
            <input
              type="text"
              name="site"
              value={formData.site}
              readOnly
              className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">Escalation Type *</label>
            <select
              name="escalationType"
              value={formData.escalationType}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              <option>Billing Issue</option>
              <option>Executive Escalation</option>
              <option>Headcount Reduction</option>
              <option>Leadership Concerns</option>
              <option>Task / Output Feedback</option>
              <option>Termination of Service</option>
              <option>Performance Issue</option>
              <option>Unresolved Issues</option>
              <option>Others</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Criticality *</label>
            <select
              name="criticality"
              value={formData.criticality}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">Status *</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option>Open</option>
              <option>Closed</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block mb-1 font-medium">
              Escalation Details *
            </label>
            <textarea
              name="escalationDetails"
              rows={3}
              value={formData.escalationDetails}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            />
          </div>

          <div>
            <label className="block mb-1 font-medium">OIC *</label>
            <select
              name="oic"
              value={formData.oic}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">Select</option>
              {oicOptions.map((o) => (
                <option key={o.ID} value={o.EMPNAME}>
                  {o.EMPNAME}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium">
              Attachment (optional)
            </label>

            <input
              key={fileKey}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx"
              onChange={handleFileChange}
            />
            {files && files.length > 0 && (
              <div className="mt-2 text-[11px] text-gray-600 space-y-1">
                {files.map((f, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded"
                  >
                    <span className="truncate">📎 {f.name}</span>

                    <button
                      type="button"
                      onClick={() =>
                        setFiles(files.filter((_, i) => i !== idx))
                      }
                      className="text-red-500 hover:text-red-700 text-[10px] ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>



          <div className="col-span-2 flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                resetForm(); // 🔥 manual reset button behavior
              }}
              className="px-4 py-1.5 text-xs rounded bg-gray-200 hover:bg-gray-300"
            >
              Reset
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs rounded bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium rounded bg-[#00a1c9] text-white hover:bg-[#008bb1]"
            >
              {saving ? "Saving..." : "Submit"}
            </button>
          </div>
        </form>
      </div>

      {/* ✅ Result Modal (Add Escalation) */}
      {submitStatus !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">

            <div className="flex items-center gap-3 mb-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  submitStatus === "success"
                    ? "bg-emerald-100"
                    : "bg-red-100"
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
                    ? "Submission Successful"
                    : "Submission Failed"}
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
                {submitStatus === "success" ? "Close" : "Retry"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AddEscalationModal;