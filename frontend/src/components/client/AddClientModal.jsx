// src/components/modals/AddClientModal.jsx
import React, { useEffect, useState } from "react";
import { SERVER_URL } from "../lib/constants";
import { apiFetch } from "../lib/apiFetch";
import axios from "axios";
import { api } from "../lib/axiosInterceptor";

axios.defaults.withCredentials = true;

const INITIAL_FORM_DATA = {
  effectiveDate: new Date().toISOString().split("T")[0],
  accountCode: "(Auto Generated)",
  qbAccount: "",
  account: "",
  lob: "",
  task: "",
  msaDate: "",
  liveDate: "",
  staffingModel: "N/A",
  drfte: "0",
  phfte: "0",
  dailyWorkHrs: "",
  holidayHrs: "",
  regularRate: "",
  premiumRate: "",
  depositFee: "",
  depositFeeWaived: "no",
  setupFee: "",
  setupFeeWaived: "no",
  extraMonitorFeePerUnit: "",
  extraMonitorQty: "",
  phoneLineFeePerFTEPerMonth: 0,
  billingCycle: "Monthly",
  status: "Prospect Client",
  busAddress: "",
  state: "",
  contact1: "",
  contactNo1: "",
  contact2: "",
  contactNo2: "",
  salesperson: "In House",
  notes: "",
  termDate: "",
  site: "",
  workSetup: "",
  specialInstructions: "",
  attachments: [],
};

const AddClientModal = ({ isOpen, onClose, onSave, user }) => {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState([]);

  // "idle" | "success" | "error"
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setFormData(INITIAL_FORM_DATA);
      setFiles([]);
      setSaving(false);
      setSubmitStatus("idle");
      setSubmitMessage("");
    }
  }, [isOpen]);

  // Simple front-end account code generator
  useEffect(() => {
    const { account, task } = formData;
    if (!account || !task) return;

    const firstLetter = account.charAt(0).toUpperCase();
    const firstTwoLetters = task.substring(0, 2).toUpperCase();
    const date = new Date();
    const year = String(date.getFullYear()).substring(2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const randomId = String(Math.floor(Math.random() * 999) + 1).padStart(
      3,
      "0",
    );

    const generatedCode = `${firstLetter}${firstTwoLetters}-${year}${month}-${randomId}`;
    setFormData((prev) => ({ ...prev, accountCode: generatedCode }));
  }, [formData.account, formData.task]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "account" && { qbAccount: value }),
    }));
  };

  useEffect(() => {
    setFormData((prev) => {
      let updated = { ...prev };

      // If NOT Discontinued → clear termDate
      if (prev.status !== "Discontinued") {
        updated.termDate = "";
      }

      return updated;
    });
  }, [formData.status]);

  // Basic required-fields validation (for Save button + submit)
  const validateRequired = (data) => {
    const missing = [];

    if (!data.account || !data.account.trim()) missing.push("Account");
    if (!data.lob || !data.lob.trim()) missing.push("LOB");
    if (!data.task || !data.task.trim()) missing.push("Task");
    if (!data.status || !data.status.trim()) missing.push("Status");
    if (!data.contact1 || !data.contact1.trim()) missing.push("Contact 1");
    if (!data.contactNo1 || !data.contactNo1.trim())
      missing.push("Contact Info 1");

    if (data.status === "Active") {
      if (!data.site) missing.push("Site");
      if (!data.msaDate) missing.push("MSA Date");
      if (!data.liveDate) missing.push("Live Date");
      if (!data.billingCycle) missing.push("Billing Cycle");
    }

    return {
      isValid: missing.length === 0,
      missing,
    };
  };

  const { isValid: isFormValid } = validateRequired(formData);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { isValid, missing } = validateRequired(formData);

    if (!isValid) {
      setSubmitStatus("error");
      setSubmitMessage(
        `Please fill all required fields: ${missing.join(", ")}`,
      );
      return;
    }

    setSaving(true);
    setSubmitStatus("idle");
    setSubmitMessage("");

    try {
      const formPayload = new FormData();

      // append all fields
      Object.keys(formData).forEach((key) => {
        if (key !== "attachments") {
          const value = formData[key];

          if (value !== "" && value !== null && value !== undefined) {
            formPayload.append(key, value);
          }
        }
      });

      // append files
      files.forEach((file) => {
        formPayload.append("attachments", file);
      });

      // user info
      formPayload.append(
        "userFirstName",
        user?.firstName || user?.userEmail || "Unknown",
      );
      formPayload.append("userLastName", user?.lastName || "");

      const res = await api.post(
        `${SERVER_URL}/api/client-roster`,
        formPayload,
      );

      const data = res.data;

      if (!data.success) {
        throw new Error(data.error || "Failed to save client.");
      }

      setSubmitStatus("success");
      setSubmitMessage("Client profile saved successfully.");

      if (onSave && data.data) {
        onSave(data.data);
      }
    } catch (err) {
      console.error("Error saving client:", err);
      setSubmitStatus("error");
      setSubmitMessage(err.message || "Error saving client.");
    } finally {
      setSaving(false);
    }
  };

  // Handler for the centered result modal button
  const handleResultAction = () => {
    if (submitStatus === "success") {
      // Close everything
      setSubmitStatus("idle");
      setSubmitMessage("");
      onClose();
    } else if (submitStatus === "error") {
      // Just go back to the form
      setSubmitStatus("idle");
      setSubmitMessage("");
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);

    const maxSize = 5 * 1024 * 1024; // 5MB

    const validFiles = selectedFiles.filter((file) => {
      if (file.size > maxSize) {
        setSubmitStatus("error");
        setSubmitMessage(`${file.name} exceeds 5MB`);
        return false;
      }
      return true;
    });

    const uniqueFiles = validFiles.filter(
      (file) => !files.some((f) => f.name === file.name),
    );

    setFiles((prev) => [...prev, ...uniqueFiles]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Add Client</h2>
            <p className="text-[11px] text-gray-500">
              Fill out the details below to register a new client.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body (scrollable) */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-4 space-y-5 text-xs"
        >
          {/* Row: Account Code + Status + Dates */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Account Code
              </label>
              <input
                type="text"
                name="accountCode"
                value={formData.accountCode}
                readOnly
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 bg-gray-50 text-xs text-gray-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Status <span className="text-red-500">*</span>
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-xs"
              >
                <option value="Prospect Client">Prospect Client</option>
                <option value="Onboarding">Onboarding</option>
                <option value="Pre-Sale">Pre-Sale</option>
                <option value="Active">Active</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Declined">Declined</option>
                <option value="Discontinued">Discontinued</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Effective Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="effectiveDate"
                value={formData.effectiveDate}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Row: MSA / Live / Term Date / Site */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                MSA Date
              </label>
              <input
                type="date"
                name="msaDate"
                value={formData.msaDate || ""}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Live Date{" "}
                {formData.status === "Active" && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <input
                type="date"
                name="liveDate"
                value={formData.liveDate || ""}
                onChange={handleInputChange}
                className={`mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Termination Date
              </label>
              <input
                type="date"
                name="termDate"
                value={formData.termDate || ""}
                onChange={handleInputChange}
                disabled={formData.status !== "Discontinued"}
                className={`mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs ${
                  formData.status !== "Discontinued"
                    ? "bg-gray-100 cursor-not-allowed"
                    : ""
                }`}
              />
            </div>

            {/* ✅ MOVED SITE HERE */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Site
              </label>
              <select
                name="site"
                value={formData.site}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="">(Select)</option>
                <option value="PH">PH</option>
                <option value="DR">DR</option>
                <option value="Blended">Blended</option>
              </select>
            </div>
          </div>

          {/* Work Setup / Account / LOB / Task */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* ✅ NEW FIELD */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Work Setup
              </label>
              <select
                name="workSetup"
                value={formData.workSetup}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="">(Select)</option>
                <option value="Onsite">Onsite</option>
                <option value="Hybrid">Hybrid</option>
                <option value="WFH">WFH</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Account <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="account"
                value={formData.account}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                LOB <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="lob"
                value={formData.lob}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Task <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="task"
                value={formData.task}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Address / State / Salesperson */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-medium text-gray-600">
                Business Address
              </label>
              <textarea
                name="busAddress"
                rows={2}
                value={formData.busAddress}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs resize-none overflow-y-auto"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                State / Country
              </label>
              <select
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="">(Select)</option>
                {[
                  "CANADA",
                  "UNITED KINGDOM",
                  "AL",
                  "AK",
                  "AZ",
                  "AR",
                  "CA",
                  "CO",
                  "CT",
                  "DE",
                  "FL",
                  "GA",
                  "HI",
                  "ID",
                  "IL",
                  "IN",
                  "IA",
                  "KS",
                  "KY",
                  "LA",
                  "ME",
                  "MD",
                  "MA",
                  "MI",
                  "MN",
                  "MS",
                  "MO",
                  "MT",
                  "NE",
                  "NV",
                  "NH",
                  "NJ",
                  "NM",
                  "NY",
                  "NC",
                  "ND",
                  "OH",
                  "OK",
                  "OR",
                  "PA",
                  "RI",
                  "SC",
                  "SD",
                  "TN",
                  "TX",
                  "UT",
                  "VT",
                  "VA",
                  "WA",
                  "WV",
                  "WI",
                  "WY",
                  "NSW",
                  "VIC",
                  "QLD",
                  "WA",
                  "SA",
                  "TAS",
                  "NT",
                  "ACT",
                ].map((abbr, index) => (
                  <option key={index} value={abbr}>
                    {abbr}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Salesperson <span className="text-red-500">*</span>
              </label>
              <select
                name="salesperson"
                value={formData.salesperson}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="In House">In House</option>
                <option value="Avi Ederi">Avi Ederi</option>
                <option value="Avraham Ederi">Avraham Ederi</option>
                <option value="Chaim Greenfeld">Chaim Greenfeld</option>
                <option value="Chaim Schnitzler">Chaim Schnitzler</option>
                <option value="Chaim Solomon">Chaim Solomon</option>
                <option value="Christopher Mojica">Christopher Mojica</option>
                <option value="Client Referral">Client Referral</option>
                <option value="Dave Dial">Dave Dial</option>
                <option value="Isaac Joseph">Isaac Joseph</option>
                <option value="Mayer Rubinstein">Mayer Rubinstein</option>
                <option value="Michael Matsas">Michael Matsas</option>
                <option value="Steven Rosen">Steven Rosen</option>
              </select>
            </div>
          </div>

          {/* Contacts */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Contact Person 1 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="contact1"
                value={formData.contact1}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Contact Info 1 (Phone / Email){" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="contactNo1"
                value={formData.contactNo1}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Contact Person 2
              </label>
              <input
                type="text"
                name="contact2"
                value={formData.contact2}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Contact Info 2 (Phone / Email)
              </label>
              <input
                type="text"
                name="contactNo2"
                value={formData.contactNo2}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Staffing / Billing / FTE / Hours / Rates */}
          <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Staffing Model
              </label>
              <select
                name="staffingModel"
                value={formData.staffingModel}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="FTE-Based">FTE-Based</option>
                <option value="Project-Based">Project-Based</option>
                <option value="N/A">N/A</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Billing Cycle
              </label>
              <select
                name="billingCycle"
                value={formData.billingCycle}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                PH FTE
              </label>
              <input
                type="number"
                name="phfte"
                value={formData.phfte}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                DR FTE
              </label>
              <input
                type="number"
                name="drfte"
                value={formData.drfte}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Daily Working Hrs
              </label>
              <input
                type="number"
                name="dailyWorkHrs"
                value={formData.dailyWorkHrs}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Holiday Hrs
              </label>
              <input
                type="number"
                name="holidayHrs"
                value={formData.holidayHrs}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Regular Rate ($)
              </label>
              <input
                type="number"
                step="0.01"
                name="regularRate"
                value={formData.regularRate}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Premium Rate ($)
              </label>
              <input
                type="number"
                step="0.01"
                name="premiumRate"
                value={formData.premiumRate}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Deposit / Setup / Extras */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* Deposit Fee */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-medium text-gray-600">
                  Deposit Fee ($)
                </label>
                <label className="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.depositFeeWaived === "yes"}
                    onChange={(e) => {
                      const waived = e.target.checked ? "yes" : "no";

                      handleInputChange({
                        target: { name: "depositFeeWaived", value: waived },
                      });

                      if (waived === "yes") {
                        handleInputChange({
                          target: { name: "depositFee", value: 0 },
                        });
                      }
                    }}
                    className="h-3 w-3"
                  />
                  Waived
                </label>
              </div>

              {formData.depositFeeWaived !== "yes" ? (
                <input
                  type="number"
                  step="0.01"
                  name="depositFee"
                  value={formData.depositFee}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs transition-all duration-150 ease-out"
                />
              ) : (
                <p className="mt-1 text-[11px] text-gray-500 italic transition-all duration-150 ease-out">
                  Waived (amount set to $0)
                </p>
              )}
            </div>

            {/* Setup Fee */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-medium text-gray-600">
                  Setup Fee ($)
                </label>
                <label className="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.setupFeeWaived === "yes"}
                    onChange={(e) => {
                      const waived = e.target.checked ? "yes" : "no";

                      handleInputChange({
                        target: { name: "setupFeeWaived", value: waived },
                      });

                      if (waived === "yes") {
                        handleInputChange({
                          target: { name: "setupFee", value: 0 },
                        });
                      }
                    }}
                    className="h-3 w-3"
                  />
                  Waived
                </label>
              </div>

              {formData.setupFeeWaived !== "yes" ? (
                <input
                  type="number"
                  step="0.01"
                  name="setupFee"
                  value={formData.setupFee}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs transition-all duration-150 ease-out"
                />
              ) : (
                <p className="mt-1 text-[11px] text-gray-500 italic transition-all duration-150 ease-out">
                  Waived (amount set to $0)
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Extra Monitor Qty
              </label>
              <input
                type="number"
                name="extraMonitorQty"
                value={formData.extraMonitorQty}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Monitor Fee / Unit ($)
              </label>
              <input
                type="number"
                step="0.01"
                name="extraMonitorFeePerUnit"
                value={formData.extraMonitorFeePerUnit}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Phone Line Fee / FTE / Month
              </label>
              <input
                type="number"
                step="0.01"
                name="phoneLineFeePerFTEPerMonth"
                value={formData.phoneLineFeePerFTEPerMonth}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Special Instructions + Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Special Instructions */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Special Instructions
              </label>
              <textarea
                name="specialInstructions"
                rows={4}
                value={formData.specialInstructions || ""}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[12px] resize-none overflow-y-auto"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600">
                Notes
              </label>
              <textarea
                name="notes"
                rows={4}
                value={formData.notes}
                onChange={handleInputChange}
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[12px] resize-none overflow-y-auto"
              />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-[11px] font-medium text-gray-600">
              Attachments
            </label>

            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx"
              onChange={handleFileChange}
              className="mt-1 w-full text-xs"
            />
            {files.length > 0 && (
              <ul className="mt-2 text-[11px] text-gray-600 space-y-1">
                {files.map((file, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded"
                  >
                    <span className="truncate">📎 {file.name}</span>

                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-red-500 text-[10px] hover:underline ml-2"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer buttons */}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving || !isFormValid}
              className={`h-8 px-4 rounded-lg text-[11px] font-medium flex items-center gap-2
                ${
                  saving || !isFormValid
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-[#003b5c] text-white hover:bg-[#002a40]"
                }`}
            >
              {saving && (
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white/50 border-t-white animate-spin" />
              )}
              {saving ? "Saving..." : "Save Client"}
            </button>
          </div>
        </form>

        {/* Centered Result Modal (on top of form) */}
        {submitStatus !== "idle" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full
                  ${
                    submitStatus === "success" ? "bg-emerald-100" : "bg-red-100"
                  }`}
                >
                  {submitStatus === "success" ? (
                    <span className="text-lg text-emerald-700 animate-bounce">
                      ✔
                    </span>
                  ) : (
                    <span className="text-lg text-red-700 animate-shake">
                      !
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {submitStatus === "success"
                      ? "Client Saved"
                      : "Unable to Save"}
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
                  className={`h-8 px-4 rounded-lg text-[11px] font-medium
                    ${
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

export default AddClientModal;
