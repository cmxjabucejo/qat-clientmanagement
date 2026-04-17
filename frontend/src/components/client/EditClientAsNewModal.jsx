import React, { useEffect, useState } from "react";
import { SERVER_URL } from "../lib/constants";
import { apiFetch } from "../lib/apiFetch";
import axios from "axios";

axios.defaults.withCredentials = true;

// Helper: convert DB date to yyyy-mm-dd for inputs
const toInputDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

// Helper: build notes string = previous history + new signed/timestamped note
const buildNotesWithHistory = (
  previousNotes,
  newNote,
  userFirstName,
  userLastName,
) => {
  const fullName =
    `${userFirstName || ""} ${userLastName || ""}`.trim() || "Unknown User";

  const now = new Date();
  const options = {
    timeZone: "America/New_York", // EST
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };

  // Example: "11/19/2025, 02:58 PM" → remove comma
  let timestamp = now.toLocaleString("en-US", options).replace(",", "");
  const headerLine = `---------- ${fullName} || ${timestamp} EST ----------`;

  const newBlock = `${headerLine}\n\n${newNote.trim()}`;

  if (previousNotes && previousNotes.trim()) {
    return `${previousNotes.trim()}\n\n${newBlock}\n`;
  }

  return `${newBlock}\n`;
};

const EditClientAsNewModal = ({ isOpen, onClose, onSave, client }) => {
  const [formData, setFormData] = useState({
    effectiveDate: "",
    accountCode: "",
    qbAccount: "",
    account: "",
    lob: "",
    task: "",
    msaDate: "",
    liveDate: "",
    staffingModel: "N/A",
    drfte: "",
    phfte: "",
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
    previousNotes: "",
    notes: "",
    termDate: "",
    site: "",
    workSetup: "",
    specialInstructions: "",
    attachments: [],
    newFiles: [],
  });

  const [saving, setSaving] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle"); // "idle" | "success" | "error"
  const [submitMessage, setSubmitMessage] = useState("");
  const [error, setError] = useState("");

  // When modal opens, prefill from client
  useEffect(() => {
    if (isOpen && client) {
      setFormData({
        effectiveDate:
          toInputDate(client.EFFECTIVEDATE) ||
          new Date().toISOString().split("T")[0],
        accountCode: client.ACCOUNTCODE || "(Auto Generated)",
        qbAccount: client.QBACCOUNT || client.ACCOUNT || "",
        account: client.ACCOUNT || "",
        lob: client.LOB || "",
        task: client.TASK || "",
        msaDate: toInputDate(client.MSA_DATE),
        liveDate: toInputDate(client.LIVE_DATE),
        staffingModel: client.STAFFINGMODEL || "N/A",
        drfte: client.DRFTE ?? "",
        phfte: client.PHFTE ?? "",
        dailyWorkHrs: client.DAILYWORKHRS ?? "",
        holidayHrs: client.HOLIDAYHRS ?? "",
        regularRate: client.REGULARRATE ?? "",
        premiumRate: client.PREMIUMRATE ?? "",
        depositFee: client.DEPOSITFEE ?? "",
        depositFeeWaived: client.DEPOSITFEEWAIVED || "no",
        setupFee: client.SETUPFEE ?? "",
        setupFeeWaived: client.SETUPFEEWAIVED || "no",
        extraMonitorFeePerUnit: client.EXTRAMONITORFEEPERUNIT ?? "",
        extraMonitorQty: client.EXTRAMONITORQTY ?? "",
        phoneLineFeePerFTEPerMonth: client.PHONELINEFEEPERFTEPERMONTH ?? 0,
        billingCycle: client.BILLINGCYCLE || "Monthly",
        status: client.STATUS || "Prospect Client",
        busAddress: client.BUSADDRESS || "",
        state: client.STATE || "",
        contact1: client.CONTACT1 || "",
        contactNo1: client.CONTACTNO1 || "",
        contact2: client.CONTACT2 || "",
        contactNo2: client.CONTACTNO2 || "",
        salesperson: client.SALESPERSON || "In House",
        previousNotes: client.NOTES || "", // 🔹 keep old notes
        notes: "", // 🔹 new note starts blank
        termDate: toInputDate(client.TERMDATE),
        site: client.SITE || "",
        workSetup: client.WORKSETUP || "",
        specialInstructions: client.SPECIAL_INSTRUCTIONS || "",
        attachments: Array.isArray(client.ATTACHMENTS)
          ? client.ATTACHMENTS
          : (() => {
              try {
                return client.ATTACHMENTS ? JSON.parse(client.ATTACHMENTS) : [];
              } catch {
                return [];
              }
            })(),
      });
      setSaving(false);
      setSubmitStatus("idle");
      setSubmitMessage("");
    }
  }, [isOpen, client]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const newFormData = {
        ...prev,
        [name]: value,
        ...(name === "account" && { qbAccount: value }),
      };

      // Dynamically update required fields when status changes
      if (name === "status") {
        setRequiredFields(getRequiredFields(value));
      }

      return newFormData;
    });
  };

  // Same validation as AddClient
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
      if (
        data.regularRate === "" ||
        data.regularRate === null ||
        data.regularRate === undefined
      )
        missing.push("Bill Rate (Regular Hrs)");
      if (
        data.premiumRate === "" ||
        data.premiumRate === null ||
        data.premiumRate === undefined
      )
        missing.push("Bill Rate (Premium Hrs)");
      if (data.drfte === "" || data.drfte === null || data.drfte === undefined)
        missing.push("DR Headcount");
      if (data.phfte === "" || data.phfte === null || data.phfte === undefined)
        missing.push("PH Headcount");
    }

    if (data.status === "Discontinued") {
      if (!data.termDate) missing.push("Termination Date");
    }

    return {
      isValid: missing.length === 0,
      missing,
    };
  };

  const getRequiredFields = (status) => {
    const base = ["account", "task", "status", "contact1", "contactNo1"];

    if (status === "Active") {
      return [
        ...base,
        "site",
        "msaDate",
        "liveDate",
        "billingCycle",
        "regularRate",
        "premiumRate",
        "drfte",
        "phfte",
      ];
    }

    if (status === "Discontinued") {
      return [...base, "termDate"];
    }

    return base;
  };

  const [isFormValid, setIsFormValid] = useState(false);

  useEffect(() => {
    const { isValid } = validateRequired(formData);
    setIsFormValid(isValid);
  }, [formData]);

  const [requiredFields, setRequiredFields] = useState(
    getRequiredFields(formData.status),
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { isValid, missing } = validateRequired(formData);
    if (!isValid) {
      setError(
        `Please fill the required fields for "${formData.status}": ${missing.join(", ")}`
      );
      return;
    }

    const finalNotes = buildNotesWithHistory(
      formData.previousNotes,
      formData.notes,
      localStorage.getItem("userFirstname"),
      localStorage.getItem("userLastname"),
    );

    setError("");
    setSaving(true);

    try {
      const fd = new FormData();

      // 🔹 append normal fields
      Object.keys(formData).forEach((key) => {
        if (key === "attachments") {
          fd.append("existingAttachments", JSON.stringify(formData.attachments));
        } else if (key !== "newFiles") {
          fd.append(key, formData[key] ?? "");
        }
      });

      // 🔥 append NEW FILES
      formData.newFiles?.forEach((file) => {
        fd.append("attachments", file);
      });

      const res = await axios.post(
        `${SERVER_URL}/api/client-roster`,
        fd
      );

      const data = res.data;

      if (!data.success) {
        throw new Error(data.error || "Failed to save client.");
      }

      setSubmitStatus("success");
      setSubmitMessage("Update saved successfully.");

    } catch (err) {
      console.error("Error saving client:", err);
      setSubmitStatus("error");
      setSubmitMessage(err.message || "Error saving client.");
    } finally {
      setSaving(false);
    }
  };

  const handleResultAction = () => {
    if (submitStatus === "success") {
      setSubmitStatus("idle");
      setSubmitMessage("");

      if (onSave) {
        onSave(); // 🔹 trigger after success modal is acknowledged
      }

      onClose(); // 🔹 also close the modal here
    } else if (submitStatus === "error") {
      setSubmitStatus("idle");
      setSubmitMessage("");
    }
  };

  if (!isOpen || !client) return null;

  const openAttachment = async (file) => {
    try {
      let key = file;

      // 🔹 handle old full S3 URLs
      if (file.includes(".com/")) {
        key = file.split(".com/")[1];
      }

      const res = await apiFetch(
        `${SERVER_URL}/api/client-attachment?key=${encodeURIComponent(key)}`,
          {
            method: "GET",
          }
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
    <>
      {/* Centered Result Modal */}
      {submitStatus !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full
            ${submitStatus === "success" ? "bg-emerald-100" : "bg-red-100"}`}
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
                    ? "Client Data Updated Successfully"
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

      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Edit Client
              </h2>

              <p className="text-[11px] text-gray-500">
                Update the details below.
              </p>

              {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
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
                  <option value="Active">Active</option>
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
                  Live Date
                </label>
                <input
                  type="date"
                  name="liveDate"
                  value={formData.liveDate || ""}
                  onChange={handleInputChange}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
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
                  className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
                />
              </div>

              {/* ✅ SITE MOVED */}
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

            {/* Account / LOB / Task / Site */}
            {/* Work Setup / Account / LOB / Task */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* ✅ NEW */}
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
                <label>Account *</label>
                <input
                  type="text"
                  name="account"
                  value={formData.account}
                  onChange={handleInputChange}
                  className="mt-1 w-full border rounded px-2 py-1.5"
                />
              </div>

              <div>
                <label>LOB *</label>
                <input
                  type="text"
                  name="lob"
                  value={formData.lob}
                  onChange={handleInputChange}
                  className="mt-1 w-full border rounded px-2 py-1.5"
                />
              </div>

              <div>
                <label>Task *</label>
                <input
                  type="text"
                  name="task"
                  value={formData.task}
                  onChange={handleInputChange}
                  className="mt-1 w-full border rounded px-2 py-1.5"
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
                  Staffing Model{" "}
                  {requiredFields.includes("billingCycle") && (
                    <span className="text-red-500">*</span>
                  )}
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
                  Billing Cycle{" "}
                  {requiredFields.includes("billingCycle") && (
                    <span className="text-red-500">*</span>
                  )}
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
                  PH FTE{" "}
                  {requiredFields.includes("phfte") && (
                    <span className="text-red-500">*</span>
                  )}
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
                  DR FTE{" "}
                  {requiredFields.includes("drfte") && (
                    <span className="text-red-500">*</span>
                  )}
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
                  Daily Working Hrs{" "}
                  {requiredFields.includes("billingCycle") && (
                    <span className="text-red-500">*</span>
                  )}
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
                  Holiday Hrs{" "}
                  {requiredFields.includes("billingCycle") && (
                    <span className="text-red-500">*</span>
                  )}
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
                  Regular Rate ($){" "}
                  {requiredFields.includes("regularRate") && (
                    <span className="text-red-500">*</span>
                  )}
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
                  Premium Rate ($){" "}
                  {requiredFields.includes("premiumRate") && (
                    <span className="text-red-500">*</span>
                  )}
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

            {/* Bottom Section: Left = Notes | Right = Special Instructions + Attachments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* LEFT SIDE */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600">
                    Previous Notes
                  </label>
                  <textarea
                    rows={6}
                    value={formData.previousNotes}
                    readOnly
                    disabled
                    className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-gray-50 text-gray-500 whitespace-pre-line cursor-not-allowed resize-none overflow-y-auto"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600">
                    New Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={6}
                    value={formData.notes}
                    onChange={handleInputChange}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px] resize-none overflow-y-auto h-32"
                    placeholder="Type your new note here."
                  />
                </div>
              </div>

              {/* RIGHT SIDE */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600">
                    Special Instructions
                  </label>
                  <textarea
                    name="specialInstructions"
                    rows={6}
                    value={formData.specialInstructions || ""}
                    onChange={handleInputChange}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-[11px] resize-none overflow-y-auto"
                    placeholder="Enter special instructions here."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600">
                    Attachments
                  </label>

                  <div className="mt-1 min-h-[120px] w-full border border-gray-200 rounded-lg bg-gray-50 px-3 py-2 h-32">

                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files);

                        setFormData((prev) => ({
                          ...prev,
                          newFiles: [...(prev.newFiles || []), ...files],
                        }));
                      }}
                      className="mt-1 text-[11px]"
                    />

                    {/* EXISTING FILES */}
                    {formData.attachments?.length > 0 ? (
                      <ul className="space-y-2 text-[11px]">
                        {formData.attachments.map((file, idx) => (
                          <li
                            key={idx}
                            className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 border border-gray-100"
                          >
                            <span className="truncate text-gray-700">
                              📎 {file?.name || "Unnamed file"}
                            </span>

                            <div className="flex items-center gap-2">
                              {/* OPEN */}
                              <button
                                type="button"
                                onClick={() => openAttachment(file.url)}
                                className="text-[#003b5c] text-[10px] hover:underline"
                              >
                                Open
                              </button>

                              {/* REMOVE */}
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    attachments: prev.attachments.filter((_, i) => i !== idx),
                                  }))
                                }
                                className="text-red-500 text-[10px]"
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-gray-400">No attachments available</p>
                    )}

                    {/* 🔥 STEP 3: NEW FILES PREVIEW (ADD THIS HERE) */}
                    {formData.newFiles?.length > 0 && (
                      <div className="mt-3 border-t pt-2">
                        <p className="text-[10px] text-gray-500 mb-1">New Files:</p>

                        {formData.newFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between bg-blue-50 px-2 py-1 rounded text-[11px]"
                          >
                            <span className="truncate">📎 {file.name}</span>

                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  newFiles: prev.newFiles.filter((_, i) => i !== idx),
                                }))
                              }
                              className="text-red-500 text-[10px]"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>




                </div>
              </div>
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
                disabled={saving}
                className={`h-8 px-4 rounded-lg text-[11px] font-medium flex items-center gap-2
                ${
                  saving
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-[#003b5c] text-white hover:bg-[#002a40]"
                }`}
              >
                {saving && (
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                )}
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditClientAsNewModal;
