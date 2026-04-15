import React, { useEffect, useMemo, useState } from "react";
import { SERVER_URL } from "../lib/constants";
import ClientSuiteHeader from "../common/ClientSuiteHeader";
import ViewResponseModal from "../surveyModals/ViewResponseModal";
import SendSurveyEmailModal from "../surveyModals/SendSurveyEmailModal";
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
    const res = await fetch(`${SERVER_URL}/api/clients`); // ✅ FIX HERE
    const data = await res.json();
    setClients(
      data.map(c => ({
        ...c,
        ACCOUNT: c.ACCOUNT?.toUpperCase()
      }))
    );
  } catch (err) {
    console.error("Error fetching clients:", err);
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
                       {c.ACCOUNT?.toUpperCase()}
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

          <SendSurveyEmailModal
            isOpen={showEmailPanel}
            onClose={() => setShowEmailPanel(false)}
            clients={clients}
            onSuccess={(data, form) => {
              console.log("Survey email sent:", data, form);
            }}
            onError={(err, form) => {
              console.error("Survey email failed:", err, form);
            }}
          />

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
