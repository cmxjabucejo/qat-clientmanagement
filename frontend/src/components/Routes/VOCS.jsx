import React, { useEffect, useMemo, useState } from "react";
import { SERVER_URL } from "../lib/constants";
import ClientSuiteHeader from "../common/ClientSuiteHeader";
import ViewResponseModal from "../surveyModals/ViewResponseModal";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from "recharts";

const VOCS = () => {

  /*
  ========================================
  1. HELPERS (PURE FUNCTIONS)
  ========================================
  */

  const getMonthKey = (date) => {
    if (!date) return "";
    const d = new Date(date.replace(" ", "T"));
    if (isNaN(d)) return "";
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
  };

  const getMonth = (date) => {
    if (!date) return "-";
    const d = new Date(date.replace(" ", "T"));
    if (isNaN(d)) return "-";
    return d.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
  };

  const ratingColor = (score) => {
    if (score >= 4) return "bg-blue-100 text-blue-700";
    if (score === 3) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const parseMonthKey = (key) => {
    if (!key) return null;

    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1);
  };

  const getMonthRange = (selectedMonth, responses) => {
    let endDate;

    if (selectedMonth) {
      endDate = parseMonthKey(selectedMonth);
    } else {
      // fallback → latest date in data
      const dates = responses
        .map(r => new Date(r.submitted_at.replace(" ", "T")))
        .filter(d => !isNaN(d));

      endDate = new Date(Math.max(...dates));
    }

    const months = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(endDate);
      d.setMonth(d.getMonth() - i);

      months.push({
        key: `${d.getFullYear()}-${d.getMonth() + 1}`,
        label: d.toLocaleString("en-US", {
          month: "short",
          year: "numeric",
        })
      });
    }

    return months;
  };

  const parseAttachments = (files) => {
    if (!files) return [];

    try {
      if (typeof files === "string") {
        const parsed = JSON.parse(files);
        return Array.isArray(parsed) ? parsed : [files];
      }
      return Array.isArray(files) ? files : [];
    } catch {
      return [files];
    }
  };

const openAttachment = async (key) => {
  console.log("KEY SENT:", key);

  try {
    const res = await fetch(
      `${SERVER_URL}/api/voc-attachment?key=${encodeURIComponent(key)}`
    );

    const data = await res.json();

    console.log("API RESPONSE:", data);

    if (data.success && data.url) {
      window.open(data.url, "_blank");
    } else {
      alert("Failed to get attachment URL");
    }
  } catch (err) {
    console.error("Attachment error:", err);
  }
};


  /*
  ========================================
  2. STATE
  ========================================
  */

  // Data
  const [responses, setResponses] = useState([]);
  const [clients, setClients] = useState([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedClient, setSelectedClient] = useState("");

  // Email
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState("idle");
  const [emailMessage, setEmailMessage] = useState("");

  const [emailForm, setEmailForm] = useState({
    month: "",
    client: "",
    emailType: "",
    email: "",
    recipientName: "",
    agentName: "",
    notes: "",
  });


  /*
  ========================================
  3. MEMO (DERIVED DATA)
  ========================================
  */

  // Month dropdown
  const months = useMemo(() => {
    const map = new Map();

    responses.forEach((r) => {
      if (!r.submitted_at) return;

      const d = new Date(r.submitted_at.replace(" ", "T"));
      if (isNaN(d)) return;

      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const label = d.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
      });

      map.set(key, label);
    });

    return Array.from(map.entries()).sort(
      (a, b) => new Date(a[0]) - new Date(b[0])
    );
  }, [responses]);


  // Table filter logic
  const filteredResponses = useMemo(() => {
    return responses.filter((row) => {

      const matchSearch = searchTerm
        ? [row.name, row.company, row.email, row.tasks]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        : true;

      const matchClient = selectedClient
        ? row.company === selectedClient
        : true;

      const matchMonth = selectedMonth
        ? getMonthKey(row.submitted_at) === selectedMonth
        : true;

      return matchSearch && matchClient && matchMonth;
    });
  }, [responses, searchTerm, selectedClient, selectedMonth]);


  const dashboard = useMemo(() => {
    const base = responses.filter((row) => {
      const matchClient = selectedClient
        ? row.company === selectedClient
        : true;

      const matchMonth = selectedMonth
        ? getMonthKey(row.submitted_at) === selectedMonth
        : true;

      return matchClient && matchMonth;
    });

    if (!base.length) return null;

    const avg = (field) =>
      (
        base.reduce((sum, r) => sum + (Number(r[field]) || 0), 0) /
        base.length
      ).toFixed(2);

    let detractor = 0;
    let passive = 0;
    let promoter = 0;

    base.forEach((r) => {
      const score = Number(r.recommend);

      if (score <= 6) detractor++;
      else if (score <= 8) passive++;
      else promoter++;
    });

    const total = detractor + passive + promoter;

    const nps =
      total === 0 ? 0 : ((promoter - detractor) / total * 100).toFixed(2);

    return {
      satisfaction: avg("satisfaction"),
      communication: avg("communication"),
      collaboration: avg("collaboration"),
      consistency: avg("consistency"),
      promoter,
      passive,
      detractor,
      nps,
    };
  }, [responses, selectedClient, selectedMonth]); 

  // Graph Data
  const monthlyData = useMemo(() => {
    const base = selectedClient
      ? responses.filter(r => r.company === selectedClient)
      : responses;

    if (!base.length) return [];

    const map = new Map();

    // 🔹 GROUP ONLY EXISTING DATA
    base.forEach((r) => {
      if (!r.submitted_at) return;

      const d = new Date(r.submitted_at.replace(" ", "T"));
      if (isNaN(d)) return;

      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const label = d.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
      });

      if (!map.has(key)) {
        map.set(key, {
          label,
          satisfaction: [],
          recommend: [],
        });
      }

      const entry = map.get(key);
      entry.satisfaction.push(Number(r.satisfaction) || 0);
      entry.recommend.push(Number(r.recommend) || 0);
    });

    // 🔹 SORT ONLY MONTHS WITH DATA
    const allMonths = Array.from(map.entries()).sort(
      (a, b) => new Date(a[0]) - new Date(b[0])
    );

    // 🔹 DETERMINE END INDEX (ANCHOR MONTH)
    let endIndex;

    if (selectedMonth) {
      endIndex = allMonths.findIndex(([key]) => key === selectedMonth);

      // If selected month has no data → fallback to latest available before it
      if (endIndex === -1) {
        const before = allMonths.filter(
          ([key]) => new Date(key) <= new Date(selectedMonth)
        );
        endIndex = before.length - 1;
      }
    } else {
      endIndex = allMonths.length - 1; // latest month
    }

    if (endIndex < 0) return [];

    // 🔹 TAKE LAST 6 (MAX) FROM EXISTING DATA ONLY
    const startIndex = Math.max(0, endIndex - 5);
    const selectedRange = allMonths.slice(startIndex, endIndex + 1);

    // 🔹 BUILD FINAL DATA
    return selectedRange.map(([key, val]) => {
      const avg = (arr) =>
        arr.reduce((a, b) => a + b, 0) / arr.length;

      let detractor = 0;
      let passive = 0;
      let promoter = 0;

      val.recommend.forEach((score) => {
        if (score <= 6) detractor++;
        else if (score <= 8) passive++;
        else promoter++;
      });

      const total = detractor + passive + promoter;

      const nps =
        total === 0 ? 0 : ((promoter - detractor) / total) * 100;

      return {
        label: val.label,
        satisfaction: avg(val.satisfaction).toFixed(2),
        nps: nps.toFixed(2),
      };
    });

  }, [responses, selectedClient, selectedMonth]);

  /*
  ========================================
  4. SIDE EFFECTS (API CALLS)
  ========================================
  */

  useEffect(() => {
    fetchResponses();
  }, []);

  useEffect(() => {
    fetchClients();
  }, []);


  /*
  ========================================
  5. API FUNCTIONS
  ========================================
  */

  const fetchResponses = async () => {
    try {
      setLoading(true);

      const res = await fetch(`${SERVER_URL}/api/voc-responses`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch VOC responses");
      }

      setResponses(data.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error loading responses");
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/clients`);
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  };


  /*
  ========================================
  6. EVENT HANDLERS
  ========================================
  */

  const handleEmailChange = (e) => {
    const { name, value } = e.target;
    setEmailForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();

    const missing = [];
    if (!emailForm.month) missing.push("Month");
    if (!emailForm.client) missing.push("Client");
    if (!emailForm.emailType) missing.push("Email Type");
    if (!emailForm.email) missing.push("Email");
    if (!emailForm.agentName) missing.push("Agent Name");

    if (emailForm.emailType === "individual" && !emailForm.recipientName) {
      missing.push("Recipient Name");
    }

    if (missing.length) {
      setEmailError(`Please fill required fields: ${missing.join(", ")}`);
      return;
    }

    setEmailError("");
    setEmailLoading(true);

    try {
      const res = await fetch(`${SERVER_URL}/api/send-survey-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailForm),
      });

      const data = await res.json();

      if (res.ok) {
        setEmailStatus("success");
        setEmailMessage(data.message || "Survey email sent successfully.");
        setShowEmailPanel(false);

        setEmailForm({
          month: "",
          client: "",
          emailType: "",
          email: "",
          recipientName: "",
          agentName: "",
          notes: "",
        });
      } else {
        setEmailStatus("error");
        setEmailMessage(data.message || "Failed to send email.");
        setShowEmailPanel(false);
      }
    } catch (err) {
      setEmailStatus("error");
      setEmailMessage("Error sending email.");
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f5f7fa] flex flex-col">
      <ClientSuiteHeader />

      <main className="flex-1 flex overflow-hidden mb-2">
        {/* Left panel */}
        <aside className="w-64 border-r border-gray-200 bg-white/80 backdrop-blur-sm p-4 space-y-4">
          <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            VOC Survey
          </h2>

          <p className="text-xs text-gray-600">Total Responses</p>

          <div className="text-2xl font-semibold text-[#003b5c]">
            {responses.length}
          </div>

          <button
            onClick={() => setShowEmailPanel(true)}
            className="w-full h-9 mt-4 px-4 rounded-lg text-xs bg-[#00a1c9] text-white hover:bg-[#008bb1]"
          >
            Send Survey Request
          </button>
        </aside>

        {/* Main content */}
        <section className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {/* LEFT */}
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  VOC Survey Responses
                </h1>
              </div>

              {/* RIGHT (Search + Button) */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                {/* SEARCH */}
                <div className="w-full md:w-72">
                  <input
                    type="text"
                    placeholder="Search responses..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 rounded-full pl-4 pr-10 text-xs bg-white border border-[#00a1c9] focus:outline-none focus:ring-2 focus:ring-[#00a1c9]"
                  />
                </div>

                {/* ✅ MONTH FILTER */}
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 px-4 text-xs bg-white border border-[#00a1c9] focus:outline-none focus:ring-2 focus:ring-[#00a1c9]"
                >
                  <option value="">All Months</option>

                  {months.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>

                {/* ✅ CLIENT FILTER */}
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="h-9 px-4 text-xs bg-white border border-[#00a1c9] focus:outline-none focus:ring-2 focus:ring-[#00a1c9]"
                >
                  <option value="">All Clients</option>
                  {clients.map((c, i) => (
                    <option key={i} value={c.ACCOUNT}>
                      {c.ACCOUNT}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* DASHBOARD + CHARTS */}
          <div className="px-5 pt-2 pb-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

              {/* =========================
                  LEFT: KPI CARDS (STACKED)
              ========================= */}
              <div className="grid grid-cols-2 gap-3">

                {/* Satisfaction */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">Satisfaction</p>
                  <p className="text-lg font-semibold text-[#003b5c]">
                    {dashboard?.satisfaction}
                  </p>
                </div>

                {/* NPS */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">NPS</p>
                  <p className="text-lg font-semibold text-[#003b5c]">
                    {dashboard?.nps}
                  </p>
                </div>

                {/* Communication */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">Communication</p>
                  <p className="text-lg font-semibold text-[#003b5c]">
                    {dashboard?.communication}
                  </p>
                </div>

                {/* Promoter */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">Promoter</p>
                  <p className="text-lg font-semibold text-green-600">
                    {dashboard?.promoter}
                  </p>
                </div>

                {/* Collaboration */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">Collaboration</p>
                  <p className="text-lg font-semibold text-[#003b5c]">
                    {dashboard?.collaboration}
                  </p>
                </div>

                {/* Passive */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">Passive</p>
                  <p className="text-lg font-semibold text-yellow-500">
                    {dashboard?.passive}
                  </p>
                </div>

                {/* Consistency */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">Consistency</p>
                  <p className="text-lg font-semibold text-[#003b5c]">
                    {dashboard?.consistency}
                  </p>
                </div>

                {/* Detractor */}
                <div className="bg-white border rounded-lg p-2 shadow-sm">
                  <p className="text-[11px] text-gray-500">Detractor</p>
                  <p className="text-lg font-semibold text-red-500">
                    {dashboard?.detractor}
                  </p>
                </div>
              </div>

              {/* =========================
                  RIGHT: CHARTS
              ========================= */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Satisfaction Chart */}
                <div className="bg-white border rounded-lg p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">
                    Satisfaction Line Graph (Monthly)
                  </h3>

                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis domain={[0, 5]} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="satisfaction"
                          stroke="#00a1c9"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* NPS Chart */}
                <div className="bg-white border rounded-lg p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">
                    NPS Line Graph (Monthly)
                  </h3>

                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis domain={[-100, 100]} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="nps"
                          stroke="#003b5c"
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* Table */}
          <div className="flex-1 px-5 pb-6 min-h-0">
            <div className="bg-white rounded-xl shadow-md border border-gray-200 h-full flex flex-col overflow-hidden">

              {loading ? (
                <div className="py-10 text-center text-xs text-gray-400">
                  Loading responses...
                </div>
              ) : error ? (
                <div className="py-10 text-center text-xs text-red-500">
                  {error}
                </div>
              ) : (
                <>
                  {/* SCROLL AREA */}
                  <div className="flex-1 overflow-y-auto">

                    <table className="min-w-full text-xs">

                      <thead className="bg-gray-50 border-b sticky top-0 z-10">
                        <tr>
                          {[
                            "Month",
                            "Name",
                            "Company",
                            "Email",
                            "Tasks",
                            "Satisfaction",
                            "Recommend",
                            "Communication",
                            "Collaboration",
                            "Consistency",
                          ].map((col) => (
                            <th
                              key={col}
                              className="px-4 py-2 text-left font-semibold text-xs text-gray-700 uppercase"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-50">

                        {filteredResponses.length === 0 && (
                          <tr>
                            <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                              No responses found
                            </td>
                          </tr>
                        )}

                        {filteredResponses.map((row) => (
                          <tr
                            key={row.id}
                            onDoubleClick={() => {
                              setSelectedRow(row);
                              setIsViewModalOpen(true);
                            }}
                            className="hover:bg-[#e1edf5]/60 transition cursor-pointer"
                          >
                            <td className="px-4 py-2">{getMonth(row.submitted_at)}</td>
                            <td className="px-4 py-2 font-medium">{row.name}</td>
                            <td className="px-4 py-2">{row.company}</td>
                            <td className="px-4 py-2">{row.email}</td>
                            <td className="px-4 py-2 max-w-xs truncate">{row.tasks}</td>

                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] ${ratingColor(row.satisfaction)}`}>
                                {row.satisfaction}
                              </span>
                            </td>

                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] ${ratingColor(row.recommend)}`}>
                                {row.recommend}
                              </span>
                            </td>

                            <td className="px-4 py-2">{row.communication}</td>
                            <td className="px-4 py-2">{row.collaboration}</td>
                            <td className="px-4 py-2">{row.consistency}</td>
                          </tr>
                        ))}

                      </tbody>
                    </table>

                  </div>
                </>
              )}
            </div>
          </div>

          {/* EMAIL RESULT MODAL */}
          {emailStatus !== "idle" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full
                    ${emailStatus === "success" ? "bg-emerald-100" : "bg-red-100"}`}
                  >
                    {emailStatus === "success" ? (
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
                      {emailStatus === "success"
                        ? "Email Sent Successfully"
                        : "Email Sending Failed"}
                    </h3>

                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {emailMessage}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailStatus("idle");

                      if (emailStatus === "success") {
                        setShowEmailPanel(false); // ✅ close form modal
                        setEmailForm({
                          month: "",
                          client: "",
                          emailType: "",
                          email: "",
                          recipientName: "",
                          agentName: "",
                        });
                      }
                    }}
                    className={`h-8 px-4 rounded-lg text-[11px] font-medium
          ${
            emailStatus === "success"
              ? "bg-[#003b5c] text-white hover:bg-[#002a40]"
              : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
                  >
                    {emailStatus === "success" ? "Close" : "Back"}
                  </button>
                </div>
              </div>
            </div>
          )}


          {/* EMAIL MODAL */}
          {showEmailPanel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-6 relative">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-sm font-semibold text-gray-800">
                    Send Survey Email
                  </h2>
                  <button
                    onClick={() => setShowEmailPanel(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                {/* Error Message */}
                {emailError && (
                  <p className="text-red-500 text-xs mb-3">{emailError}</p>
                )}

                {/* Form */}
                <form
                  onSubmit={handleEmailSubmit}
                  className="space-y-4 text-xs"
                >
                  {/* Month */}
                  <div>
                    <label>
                      Month <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="month"
                      value={emailForm.month}
                      onChange={handleEmailChange}
                      className="w-full border rounded px-2 py-1.5"
                    >
                      <option value="">Select</option>
                      {[
                        "January",
                        "February",
                        "March",
                        "April",
                        "May",
                        "June",
                        "July",
                        "August",
                        "September",
                        "October",
                        "November",
                        "December",
                      ].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Client */}
                  <div>
                    <label>Client</label>
                    <select
                      name="client"
                      value={emailForm.client}
                      onChange={handleEmailChange}
                      className="w-full border rounded px-2 py-1.5"
                    >
                      <option value="">Select</option>
                      {clients.map((c, i) => (
                        <option key={i} value={c.ACCOUNT}>
                          {c.ACCOUNT}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Client */}
                  <div>
                    <label>
                      Email Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="emailType"
                      value={emailForm.emailType}
                      onChange={handleEmailChange}
                      className="w-full border rounded px-2 py-1.5"
                    >
                      <option value="">Select</option>
                      <option value="individual">Individual</option>
                      <option value="distro">Distro</option>
                    </select>
                  </div>

                  {/* Email */}
                  <div>
                    <label>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={emailForm.email}
                      onChange={handleEmailChange}
                      className="w-full border rounded px-2 py-1.5"
                    />
                  </div>

                  {/* Recipient Name (ONLY for Individual) */}
                  {emailForm.emailType === "individual" && (
                    <div>
                      <label>
                        Recipient Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        name="recipientName"
                        value={emailForm.recipientName || ""}
                        onChange={handleEmailChange}
                        className="w-full border rounded px-2 py-1.5"
                      />
                    </div>
                  )}

                  {/* Agent Name */}
                  <div>
                    <label>
                      Agent Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="agentName"
                      value={emailForm.agentName}
                      onChange={handleEmailChange}
                      className="w-full border rounded px-2 py-1.5"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label>Notes</label>
                    <textarea
                      name="notes"
                      value={emailForm.notes}
                      onChange={handleEmailChange}
                      rows={3}
                      placeholder="Enter any additional notes..."
                      className="w-full border rounded px-2 py-1.5"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowEmailPanel(false)}
                      className="px-3 py-1 bg-gray-300 rounded"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={emailLoading}
                      className={`px-4 py-1.5 rounded text-white ${
                        emailLoading
                          ? "bg-gray-300"
                          : "bg-[#003b5c] hover:bg-[#002a40]"
                      }`}
                    >
                      {emailLoading ? "Sending..." : "Send"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <ViewResponseModal
            isOpen={isViewModalOpen}
            onClose={() => setIsViewModalOpen(false)}
            data={selectedRow}
            getMonth={getMonth}
            parseAttachments={parseAttachments}
            openAttachment={openAttachment}
          />

        </section>
      </main>
    </div>
  );
};

export default VOCS;
