import React, { useEffect, useMemo, useState } from "react";
import { SERVER_URL } from "../lib/constants";
import axios from "axios";
import ClientSuiteHeader from "../common/ClientSuiteHeader";
import ClientEscalationDetailsPanel from "../client/ClientEscalationDetailsPanel";
import AddEscalationModal from "../client/AddEscalationModal";
import UpdateEscalationModal from "../client/UpdateEscalationModal";
import * as XLSX from "xlsx";

const ClientEscalationsPage = ({ user }) => {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [selectedCriticality, setSelectedCriticality] = useState([]);
  const [selectedResolution, setSelectedResolution] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState([]);
  const [selectedOIC, setSelectedOIC] = useState("");
  const [selectedEscalation, setSelectedEscalation] = useState(() => null);
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedEscalationForEdit, setSelectedEscalationForEdit] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);

  const [sortConfig, setSortConfig] = useState({
    key: "ESCALATION_DATE",
    direction: "desc",
  });

  const fetchSession = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/session`, {
        withCredentials: true,
      });

      const currentUser = res.data?.user || null;
      const role = String(currentUser?.userLevel || "").trim().toLowerCase();

      setSessionUser(currentUser);
      setIsAdmin(role === "admin" || role === "super admin");
    } catch (err) {
      console.error("Failed to fetch session", err);
      setSessionUser(null);
      setIsAdmin(false);
    }
  };

  // Define at top level inside the component
  const fetchEscalations = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/escalations`, {
        withCredentials: true,
      });

      if (res.data?.success) {
        const allEscalations = res.data.data || [];

        // Normalize and trim OIC_EMAIL before setting
        const cleaned = allEscalations.map((e) => ({
          ...e,
          OIC_EMAIL: e.OIC_EMAIL?.trim() || "",
        }));

        setEscalations(cleaned);
      }
    } catch (err) {
      console.error("Failed to fetch escalations", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchEscalations();
  }, []);

  const getYear = (date) => new Date(date).getFullYear();

  const getMonth = (date) => new Date(date).getMonth() + 1; // 1–12

  const getQuarter = (date) => {
    const m = new Date(date).getMonth() + 1;
    return Math.ceil(m / 3); // Q1–Q4
  };


  const filteredEscalations = useMemo(() => {
    return escalations
      .filter((e) => {
        if (selectedType && e.ESCALATIONTYPE !== selectedType) return false;
        if (selectedOIC && e.OIC !== selectedOIC) return false;

        if (selectedCriticality.length > 0 && !selectedCriticality.includes(e.CRITICALITY)) return false;
        if (selectedResolution.length > 0 && !selectedResolution.includes(e.RESOLUTIONSTATUS)) return false;
        if (selectedStatus.length > 0 && !selectedStatus.includes(e.STATUS)) return false;

        if (selectedYear && getYear(e.ESCALATION_DATE) !== Number(selectedYear)) return false;
        if (selectedQuarter && getQuarter(e.ESCALATION_DATE) !== Number(selectedQuarter)) return false;
        if (selectedMonth && getMonth(e.ESCALATION_DATE) !== Number(selectedMonth)) return false;

        if (searchTerm && !e.ACCOUNT?.toLowerCase().includes(searchTerm.toLowerCase())) return false;

        return true;
      })
      .sort((a, b) => {
        const { key, direction } = sortConfig;

        let valA = a[key];
        let valB = b[key];

        // Handle dates
        if (key === "ESCALATION_DATE" || key === "RESOLVEDDATE") {
          valA = new Date(valA);
          valB = new Date(valB);
        }

        // Handle strings
        if (typeof valA === "string") {
          valA = valA.toLowerCase();
          valB = valB?.toLowerCase();
        }

        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
      })
      }, [
      escalations,
      selectedType,
      selectedCriticality,
      selectedResolution,
      selectedStatus,
      selectedOIC,
      searchTerm,
      selectedYear,
      selectedQuarter,
      selectedMonth,
      sortConfig
    ]);

  useEffect(() => {
  if (filteredEscalations.length === 0) {
    setSelectedEscalation(null);
    return;
  }

  const exists = filteredEscalations.some(
      (e) => e.ID === selectedEscalation?.ID
    );

    if (!exists) {
      setSelectedEscalation(filteredEscalations[0]);
    }
  }, [filteredEscalations, selectedEscalation]);

  // ---- STATS ----
  const totalCount = filteredEscalations.length;

  const closedCount = filteredEscalations.filter(
    (e) => e.STATUS === "Closed",
  ).length;

  const openCount = filteredEscalations.filter(
    (e) => e.STATUS === "Open",
  ).length;

  const resolvedCount = filteredEscalations.filter(
    (e) => e.RESOLUTIONSTATUS === "Resolved",
  ).length;

  const resolvedRate = totalCount
    ? Math.round((resolvedCount / totalCount) * 100)
    : 0;

  const typeCounts = {};
  const criticalityCounts = {};
  const resolutionCounts = {};
  const statusCounts = {};

  filteredEscalations.forEach((item) => {
    const { ESCALATIONTYPE, CRITICALITY, RESOLUTIONSTATUS, STATUS } = item;

    typeCounts[ESCALATIONTYPE] = (typeCounts[ESCALATIONTYPE] || 0) + 1;
    criticalityCounts[CRITICALITY] = (criticalityCounts[CRITICALITY] || 0) + 1;
    resolutionCounts[RESOLUTIONSTATUS] =
      (resolutionCounts[RESOLUTIONSTATUS] || 0) + 1;
    statusCounts[STATUS] = (statusCounts[STATUS] || 0) + 1;
  });

  const StatCard = ({ label, value }) => (
    <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200 text-left">
      <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-[#003b5c]">{value}</div>
    </div>
  );

  const formatDate = (raw) => {
    if (!raw) return "";
    const d = new Date(raw);
    return d.toLocaleDateString("en-US");
  };

  const exportToExcel = () => {
    if (filteredEscalations.length === 0) return;

    // Map only relevant fields for export
    const exportData = filteredEscalations.map((item) => ({
      "Escalation ID": item.ESCALATIONID,
      "Escalation Date": formatDate(item.ESCALATION_DATE),
      "Client Category": item.CLIENTCATEGORY,
      Account: item.ACCOUNT,
      LOB: item.LOB,
      Task: item.TASK,
      Site: item.SITE,
      OIC: item.OIC,
      Type: item.ESCALATIONTYPE,
      Details: item.ESCALATIONDETAILS,
      Validity: item.VALIDITY,
      Criticality: item.CRITICALITY,
      Status: item.STATUS,
      Resolution: item.RESOLUTIONSTATUS,
      "Actions Taken": item.ACTIONTAKEN,
      "Date Resolved": formatDate(item.RESOLVEDDATE),
    }));

    // Create worksheet and workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Escalations");

    // Trigger download
    XLSX.writeFile(workbook, "escalations.xlsx");
  };


  const years = [...new Set(escalations.map(e => getYear(e.ESCALATION_DATE)))].sort((a,b) => b-a);

  const months = [
    { value: 1, label: "Jan" },
    { value: 2, label: "Feb" },
    { value: 3, label: "Mar" },
    { value: 4, label: "Apr" },
    { value: 5, label: "May" },
    { value: 6, label: "Jun" },
    { value: 7, label: "Jul" },
    { value: 8, label: "Aug" },
    { value: 9, label: "Sep" },
    { value: 10, label: "Oct" },
    { value: 11, label: "Nov" },
    { value: 12, label: "Dec" }
  ];

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f5f7fa] flex flex-col">
      <ClientSuiteHeader user={user} />
      <main className="flex-1 flex overflow-hidden mb-2">
        {/* Left Panel */}
        <aside className="w-64 border-r border-gray-200 bg-white/80 backdrop-blur-sm p-4 space-y-6 text-xs text-gray-800">
          {/* Escalation Type */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Escalation Type
            </h2>

            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">All</option>

              {Object.keys(typeCounts)
                .sort()
                .map((type) => (
                  <option key={type} value={type}>
                    {type} ({typeCounts[type]})
                  </option>
                ))}
            </select>
          </div>

          {/* Criticality */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Criticality
            </h2>
            {["High", "Medium", "Low"].map((level) => (
              <button
                key={level}
                onClick={() =>
                  setSelectedCriticality((prev) =>
                    prev.includes(level)
                      ? prev.filter((l) => l !== level)
                      : [...prev, level],
                  )
                }
                className={`inline-block px-3 py-1 mr-2 mb-2 rounded-full border ${
                  selectedCriticality.includes(level)
                    ? "bg-[#003b5c] text-white"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Resolution */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Resolution
            </h2>
            {["Resolved", "Unresolved"].map((res) => (
              <button
                key={res}
                onClick={() =>
                  setSelectedResolution((prev) =>
                    prev.includes(res)
                      ? prev.filter((r) => r !== res)
                      : [...prev, res],
                  )
                }
                className={`inline-block px-3 py-1 mr-2 mb-2 rounded-full border ${
                  selectedResolution.includes(res)
                    ? "bg-[#003b5c] text-white"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {res}
              </button>
            ))}
          </div>

          {/* Status */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Status
            </h2>
            {["Open", "Closed", "Pending"].map((status) => (
              <button
                key={status}
                onClick={() =>
                  setSelectedStatus((prev) =>
                    prev.includes(status)
                      ? prev.filter((s) => s !== status)
                      : [...prev, status],
                  )
                }
                className={`inline-block px-3 py-1 mr-2 mb-2 rounded-full border ${
                  selectedStatus.includes(status)
                    ? "bg-[#003b5c] text-white"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Year */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
              Year
            </h2>
            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="">All</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Quarter */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
              Quarter
            </h2>
            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs"
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
            >
              <option value="">All</option>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </select>
          </div>

          {/* Month */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
              Month
            </h2>
            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="">All</option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* OIC Dropdown */}
          <div>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              OIC
            </h2>
            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs"
              value={selectedOIC}
              onChange={(e) => setSelectedOIC(e.target.value)}
            >
              <option value="">All</option>
              {[...new Set(escalations.map((e) => e.OIC))].map((oic) => (
                <option key={oic} value={oic}>
                  {oic}
                </option>
              ))}
            </select>
          </div>
        </aside>

        {/* Content */}
        <section className="flex-[2] flex flex-col">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
              <StatCard label="Total Escalations" value={totalCount} />
              <StatCard label="Resolved %" value={`${resolvedRate}%`} />
              <StatCard label="Closed" value={closedCount} />
              <StatCard label="Open" value={openCount} />
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-sm font-semibold text-gray-900">
                  Client Escalations
                </h1>
                <p className="text-[11px] text-gray-500">
                  Historical and active escalation cases.
                </p>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Search account..."
                  className="w-full md:w-72 h-9 rounded-full pl-4 pr-10 text-xs bg-white text-gray-800 placeholder:text-gray-400 border border-[#00a1c9] focus:outline-none focus:ring-2 focus:ring-[#00a1c9]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />

                {isAdmin && (
                  <button
                    className="h-9 px-4 rounded-full text-xs font-medium bg-[#f58220] text-white hover:bg-[#e3751a] transition"
                    onClick={() => setShowAddModal(true)}
                  >
                    + Add Escalation
                  </button>
                )}

                {isAdmin && (
                  <button
                    className="h-9 px-4 rounded-full text-xs font-medium bg-[#00a1c9] text-white hover:bg-[#008bb1] transition"
                    onClick={exportToExcel}
                  >
                    ⬇ Export to Excel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table and Right Panel */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 px-5 pb-4">
              <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden h-full">
                {loading ? (
                  <div className="text-xs text-gray-400 text-center py-10">
                    Loading...
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="border-b border-gray-100 sticky top-0 z-10">
                        <tr>
                          {[
                            { label: "Escalation Date", key: "ESCALATION_DATE" },
                            { label: "Account", key: "ACCOUNT" },
                            { label: "Type", key: "ESCALATIONTYPE" },
                            { label: "Criticality", key: "CRITICALITY" },
                            { label: "Status", key: "STATUS" },
                          ].map((col) => (
                            <th
                              key={col.key}
                              onClick={() => handleSort(col.key)}
                              className="px-4 py-2 text-left font-semibold text-xs text-gray-800 uppercase tracking-wide bg-gray-50 cursor-pointer select-none hover:bg-gray-100"
                            >
                              <div className="flex items-center gap-1">
                                {col.label}

                                {sortConfig.key === col.key && (
                                  <span className="text-[10px]">
                                    {sortConfig.direction === "asc" ? "▲" : "▼"}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-50">
                        {filteredEscalations.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-10 text-center text-gray-400 text-xs"
                            >
                              No escalations found.
                            </td>
                          </tr>
                        ) : (
                          filteredEscalations.map((row) => (
                            <tr
                              key={row.ID}
                              onClick={() => setSelectedEscalation(row)}
                              onDoubleClick={() => {
                                setSelectedEscalationForEdit(row);
                                setShowUpdateModal(true);
                              }}
                              className={`cursor-pointer transition
                                hover:bg-[#e1edf5]/50
                                ${
                                  selectedEscalation?.ID === row.ID
                                    ? "bg-[#f0f6fa]"
                                    : ""
                                }`}
                            >
                              <td className="px-4 py-2">
                                {formatDate(row.ESCALATION_DATE)}
                              </td>

                              <td className="px-4 py-2 font-medium text-gray-800">
                                {row.ACCOUNT}
                              </td>

                              <td className="px-4 py-2">
                                {row.ESCALATIONTYPE}
                              </td>

                              <td className="px-4 py-2">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium
                                  ${
                                    row.CRITICALITY === "High"
                                      ? "bg-red-100 text-red-700"
                                      : row.CRITICALITY === "Medium"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {row.CRITICALITY || "—"}
                                </span>
                              </td>

                              <td className="px-4 py-2">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium
                                  ${
                                    row.STATUS === "Closed"
                                      ? "bg-blue-100 text-blue-800"
                                      : row.STATUS === "Pending"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {row.STATUS || "—"}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
        {/* Right Panel: Escalation Details */}
        <div className="flex-[1] min-w-[320px] max-w-[480px] border-l border-gray-200 bg-white h-full overflow-y-auto">
          <ClientEscalationDetailsPanel
            escalation={selectedEscalation}
            onReload={fetchEscalations}
          />
        </div>

        <AddEscalationModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchEscalations(); // example refresh call
          }}
        />

        <UpdateEscalationModal
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
          escalationData={selectedEscalationForEdit}
          onSuccess={() => {
            setShowUpdateModal(false);
            fetchEscalations(); // refresh table
          }}
        />

      </main>
    </div>
  );
};

export default ClientEscalationsPage;
