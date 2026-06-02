// src/components/pages/ClientRosterPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { SERVER_URL } from "../lib/constants";
import ClientSuiteHeader from "../common/ClientSuiteHeader";
import ClientDetailsPanel from "../client/ClientDetailsPanel";
import AddClientModal from "../client/AddClientModal";
import EditClientAsNewModal from "../client/EditClientAsNewModal";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { apiFetch } from "../lib/apiFetch";

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const ClientRosterPage = ({ user }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showEditAsNewModal, setShowEditAsNewModal] = useState(false);

  const [segment, setSegment] = useState("All");
  const [tagFilter, setTagFilter] = useState(null);
  const [accountMgrFilter, setAccountMgrFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [siteFilter, setSiteFilter] = useState("All");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  // const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  // 👉 NEW: sort mode (default A-Z)
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "effectiveDate", // default
    direction: "desc", // newest first
  });

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

  const fetchRoster = async () => {
    try {
      setLoading(true);

      const res = await apiFetch(`${SERVER_URL}/api/client-roster`, {
        method: "GET",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch roster.");
      }
      setClients(data.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error loading data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, []);

  const distinctSalespersons = useMemo(() => {
    const seen = new Set();
    const cleaned = [];

    clients.forEach((c) => {
      const raw = c.SALESPERSON;
      if (!raw) return;

      const trimmed = raw.trim();
      if (!trimmed) return;

      const key = trimmed.toLowerCase(); // normalize for distinct
      if (!seen.has(key)) {
        seen.add(key);
        cleaned.push(trimmed);
      }
    });

    // optional: sort alphabetically
    cleaned.sort((a, b) => a.localeCompare(b));

    return ["All", ...cleaned];
  }, [clients]);

  const distinctStatuses = useMemo(
    () => [
      "All",
      ...Array.from(new Set(clients.map((c) => c.STATUS).filter(Boolean))),
    ],
    [clients],
  );

  const distinctSites = useMemo(
    () => [
      "All",
      ...Array.from(new Set(clients.map((c) => c.SITE).filter(Boolean))),
    ],
    [clients],
  );

  const segmentOptions = [
    "All",
    "Active",
    "Onboarding",
    "Pre-Sale",
    "On Hold",
    "Discontinued",
    "Prospect Client",
  ];

  const filteredClients = useMemo(() => {
    const filtered = clients.filter((row) => {
      // segment filter based on STATUS
      if (segment !== "All") {
        const status = (row.STATUS || "").toLowerCase();
        if (status !== segment.toLowerCase()) return false;
      }

      // tag filter – using STAFFINGMODEL
      if (tagFilter && row.STAFFINGMODEL !== tagFilter) return false;

      if (accountMgrFilter !== "All" && row.SALESPERSON !== accountMgrFilter)
        return false;
      if (statusFilter !== "All" && row.STATUS !== statusFilter) return false;
      if (siteFilter !== "All" && row.SITE !== siteFilter) return false;

      // search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const haystack = [
          row.ACCOUNT,
          row.ACCOUNTCODE,
          row.CONTACT1,
          row.CONTACT2,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(term)) return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const dir = sortConfig.direction === "asc" ? 1 : -1;

      if (sortConfig.key === "client") {
        const aVal = (a.ACCOUNT || "").toLowerCase();
        const bVal = (b.ACCOUNT || "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortConfig.key === "effectiveDate") {
        const aDate = new Date(a.EFFECTIVEDATE || 0).getTime();
        const bDate = new Date(b.EFFECTIVEDATE || 0).getTime();

        if (aDate !== bDate) {
          return (aDate - bDate) * dir;
        }

        // 🔥 fallback to ID if same date
        return ((Number(a.ID) || 0) - (Number(b.ID) || 0)) * dir;
      }

      if (sortConfig.key === "status") {
        const aVal = (a.STATUS || "").toLowerCase();
        const bVal = (b.STATUS || "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      return 0;
    });
    return sorted;
  }, [
    clients,
    segment,
    tagFilter,
    accountMgrFilter,
    statusFilter,
    siteFilter,
    searchTerm,
    sortConfig,
  ]);

  const selectedClient = useMemo(() => {
    return (
      filteredClients.find((c) => c.ID === selectedClientId) ||
      filteredClients[0] ||
      null
    );
  }, [filteredClients, selectedClientId]);

  useEffect(() => {
    if (filteredClients.length === 0) {
      setSelectedClientId(null);
      return;
    }

    const stillExists = filteredClients.some(
      (client) => client.ID === selectedClientId,
    );

    if (!stillExists) {
      setSelectedClientId(filteredClients[0].ID);
    }
  }, [filteredClients, selectedClientId]);

  // useEffect(() => {
  //   if (!selectedClient) {
  //     setShowDetailsPanel(false);
  //   }
  // }, [selectedClient]);

  // Keep selected id in sync when filters change
  // useEffect(() => {
  //   if (selectedClient) setSelectedClientId(selectedClient.ID);
  // }, [selectedClient]);

  // Apply all filters EXCEPT the left "Client Status" segment,
  // so counts react to other filters (salesperson, tags, site, search, etc.)
  const baseFilteredForCounts = useMemo(() => {
    return clients.filter((row) => {
      // tag filter – using STAFFINGMODEL
      if (tagFilter && row.STAFFINGMODEL !== tagFilter) return false;

      if (accountMgrFilter !== "All" && row.SALESPERSON !== accountMgrFilter)
        return false;
      if (statusFilter !== "All" && row.STATUS !== statusFilter) return false;
      if (siteFilter !== "All" && row.SITE !== siteFilter) return false;

      // search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const haystack = [
          row.ACCOUNT,
          row.ACCOUNTCODE,
          row.CONTACT1,
          row.CONTACT2,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [
    clients,
    tagFilter,
    accountMgrFilter,
    statusFilter,
    siteFilter,
    searchTerm,
  ]);

  const getSegmentCount = (segmentLabel) => {
    if (segmentLabel === "All") {
      return baseFilteredForCounts.length;
    }

    const target = segmentLabel.toLowerCase();
    return baseFilteredForCounts.filter(
      (c) => (c.STATUS || "").toLowerCase() === target,
    ).length;
  };

  const handleNotesUpdated = (clientId, updatedNotes) => {
    setClients((prev) =>
      prev.map((c) => (c.ID === clientId ? { ...c, NOTES: updatedNotes } : c)),
    );
  };

  const openEditAsNew = () => {
    if (selectedClient) {
      setShowEditAsNewModal(true);
    }
  };

  const downloadExcel = async () => {
    if (filteredClients.length === 0) {
      alert("No data to export.");
      return;
    }

    const data = filteredClients.map((client) => ({
      "Account Code": client.ACCOUNTCODE || "",
      Account: client.ACCOUNT || "",
      LOB: client.LOB || "",
      Task: client.TASK || "",
      Status: client.STATUS || "",
      Site: client.SITE || "",
      "PH FTE": client.PHFTE || 0,
      "DR FTE": client.DRFTE || 0,
      "Total Seats": (client.PHFTE || 0) + (client.DRFTE || 0),
      "Staffing Model": client.STAFFINGMODEL || "",
      Salesperson: client.SALESPERSON || "",
      "MSA Date": formatDate(client.MSA_DATE),
      "Live Date": formatDate(client.LIVE_DATE),
      "Termination Date": formatDate(client.TERMDATE),
      "Billing Cycle": client.BILLINGCYCLE || "",
      "Regular Rate": client.REGULARRATE || "",
      "Premium Rate": client.PREMIUMRATE || "",
      "Deposit Fee": client.DEPOSITFEE || "",
      "Deposit Fee Waived": client.DEPOSITFEEWAIVED || "",
      "Setup Fee": client.SETUPFEE || "",
      "Setup Fee Waived": client.SETUPFEEWAIVED || "",
      "Extra Monitor Fee (Per Unit)": client.EXTRAMONITORFEEPERUNIT || "",
      "Extra Monitor (Qty)": client.EXTRAMONITORQTY || "",
      "DID per User / Month": client.PHONELINEFEEPERFTEPERMONTH || "",
      Notes: client.NOTES || "",
    }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Callmax Solutions";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Client Roster");

    const headers = Object.keys(data[0]);

    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length + 5, 20),
    }));

    data.forEach((row) => {
      worksheet.addRow(row);
    });

    // Header styling
    const headerRow = worksheet.getRow(1);

    headerRow.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };

    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4D68AA" },
    };

    headerRow.alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    // Freeze header row
    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      let maxLength = column.header.length;

      column.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value ? cell.value.toString() : "";
        maxLength = Math.max(maxLength, value.length);
      });

      column.width = Math.min(maxLength + 3, 50);
    });

    // Currency formatting
    [
      "Regular Rate",
      "Premium Rate",
      "Deposit Fee",
      "Setup Fee",
      "Extra Monitor Fee (Per Unit)",
      "DID per User / Month",
    ].forEach((header) => {
      const col = worksheet.getColumn(header);

      col.numFmt = "#,##0.00";
    });

    // Auto-filter
    worksheet.autoFilter = {
      from: "A1",
      to: `${String.fromCharCode(64 + headers.length)}1`,
    };

    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, "ClientRoster.xlsx");
  };

  // ✅ Only keep latest (highest ID) per ACCOUNTCODE
  const latestClientPerCode = useMemo(() => {
    const map = new Map();

    for (const client of clients) {
      const code = client.ACCOUNTCODE?.trim();
      const id = Number(client.ID) || 0;
      if (!code) continue;

      const existing = map.get(code);
      if (!existing || id > (Number(existing.ID) || 0)) {
        map.set(code, client);
      }
    }

    return Array.from(map.values());
  }, [clients]);

  const getDistinctAccountsByStatus = (statuses) => {
    const seen = new Set();

    for (const client of latestClientPerCode) {
      const status = (client.STATUS || "").toLowerCase();
      const account = client.ACCOUNT?.trim().toLowerCase();
      if (!account) continue;

      if (statuses.includes(status)) {
        seen.add(account);
      }
    }

    return seen.size;
  };

  const analytics = {
    active: getDistinctAccountsByStatus(["active"]),
    onboarding: getDistinctAccountsByStatus(["onboarding"]),
    preSale: getDistinctAccountsByStatus(["pre-sale"]),
    onHold: getDistinctAccountsByStatus(["on hold"]),
    discontinuedOrCancelled: getDistinctAccountsByStatus([
      "discontinued",
      "cancelled",
    ]),
    prospect: getDistinctAccountsByStatus(["prospect client"]),
  };

  return (
    <div className="h-screen overflow-hidden bg-[#f5f7fa] flex flex-col">
      {/* Shared header */}
      <ClientSuiteHeader user={user} />

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden mb-2">
        {/* Left Filters */}
        <aside className="w-64 border-r border-gray-200 bg-white/80 backdrop-blur-sm p-4 space-y-4">
          <section>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Client-LOB-Task
            </h2>
            <div className="space-y-1 text-xs">
              {segmentOptions
                .filter((item) => {
                  const count = getSegmentCount(item);

                  // Always show "All"
                  if (item === "All") return true;

                  // Hide if 0 or null
                  return count && count > 0;
                })
                .map((item) => (
                  <button
                    key={item}
                    onClick={() => setSegment(item)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-[#e1edf5] ${
                      segment === item
                        ? "bg-[#e1edf5] text-[#003b5c] font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    <span>{item}</span>

                    {/* Show count for all except hide if zero */}
                    {(item === "All" || getSegmentCount(item) > 0) && (
                      <span className="text-[10px] text-gray-500 bg-white px-2 py-0.5 rounded-full">
                        {getSegmentCount(item)}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </section>

          <section>
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Site
            </h2>

            <div className="flex flex-wrap gap-1.5">
              {distinctSites
                .filter((s) => s !== "All") // optional: remove “All” from chips
                .map((site) => (
                  <button
                    key={site}
                    onClick={() =>
                      setSiteFilter((prev) => (prev === site ? "All" : site))
                    }
                    className={`text-[11px] px-2.5 py-1 rounded-full border ${
                      siteFilter === site
                        ? "border-[#00a1c9] bg-[#00a1c9] text-white"
                        : "border-[#00a1c9]/40 text-[#003b5c] bg-[#e0f7fd] hover:bg-[#00a1c9] hover:text-white"
                    }`}
                  >
                    {site}
                  </button>
                ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Salesperson
              </h2>
              <select
                value={accountMgrFilter}
                onChange={(e) => setAccountMgrFilter(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00a1c9]"
              >
                {distinctSalespersons.map((sp) => (
                  <option key={sp}>{sp || "(No salesperson)"}</option>
                ))}
              </select>
            </div>

            {/* Date sort toggles */}
            <div>
              <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Sort
              </h2>
              <div className="flex gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setSortConfig({
                      key: "effectiveDate",
                      direction: "asc",
                    })
                  }
                  className={`flex-1 px-2 py-1 rounded-full border ${
                    sortConfig.key === "effectiveDate" &&
                    sortConfig.direction === "asc"
                      ? "bg-[#003b5c] text-white border-[#003b5c]"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Oldest → Newest
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSortConfig({
                      key: "effectiveDate",
                      direction: "desc",
                    })
                  }
                  className={`flex-1 px-2 py-1 rounded-full border ${
                    sortConfig.key === "effectiveDate" &&
                    sortConfig.direction === "desc"
                      ? "bg-[#003b5c] text-white border-[#003b5c]"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Newest → Oldest
                </button>
              </div>
            </div>
          </section>
        </aside>

        {/* Center Table */}
        <section className="flex-1 flex flex-col">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            {/* Analytics cards */}
            <div className="px-5 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">
                    Active Accounts
                  </div>
                  <div className="text-lg font-semibold text-[#003b5c]">
                    {analytics.active}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">
                    Onboarding Accounts
                  </div>
                  <div className="text-lg font-semibold text-[#003b5c]">
                    {analytics.onboarding}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">
                    Pre-Sale Accounts
                  </div>
                  <div className="text-lg font-semibold text-[#003b5c]">
                    {analytics.preSale}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">
                    On Hold Accounts
                  </div>
                  <div className="text-lg font-semibold text-[#003b5c]">
                    {analytics.onHold}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">
                    Discontinued
                  </div>
                  <div className="text-lg font-semibold text-[#003b5c]">
                    {analytics.discontinuedOrCancelled}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200">
                  <div className="text-[11px] font-semibold text-gray-500 mb-1">
                    Prospect Clients
                  </div>
                  <div className="text-lg font-semibold text-[#003b5c]">
                    {analytics.prospect}
                  </div>
                </div>
              </div>
            </div>

            {/* Title + search + add client */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-sm font-semibold text-gray-900">
                  Client Roster
                </h1>
                <p className="text-[11px] text-gray-500">
                  Overview of all active and onboarding clients.
                </p>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 w-full md:w-auto">
                <div className="flex-1 md:w-72">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search....."
                      className="w-full h-9 rounded-full pl-4 pr-10 text-xs bg-white text-gray-800 placeholder:text-gray-400 border border-[#00a1c9] focus:outline-none focus:ring-2 focus:ring-[#00a1c9]"
                    />
                  </div>
                </div>

                <button
                  className="h-9 px-4 rounded-full text-xs font-medium bg-[#f58220] text-white hover:bg-[#e3751a] transition self-end md:self-auto"
                  onClick={() => setIsAddClientOpen(true)}
                >
                  + Add Client
                </button>

                <button
                  className="h-9 px-4 rounded-full text-xs font-medium bg-[#00a1c9] text-white hover:bg-[#008bb1] transition self-end md:self-auto"
                  onClick={() => downloadExcel()}
                >
                  ⬇ Export to Excel
                </button>

                {/* <button
                  className="h-9 px-4 rounded-full text-xs font-medium bg-[#003b5c] text-white hover:bg-[#002c45] transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                  onClick={() => {
                    if (!selectedClient) return; // 🔥 HARD BLOCK
                    setShowDetailsPanel((prev) => !prev);
                  }}
                  disabled={!selectedClient}
                >
                  {!selectedClient ? "Select a client": showDetailsPanel ? "Hide Details" : "Show Details"}
                </button> */}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 px-5 pb-4">
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden h-full">
              {loading ? (
                <div className="py-10 text-center text-xs text-gray-400">
                  Loading client roster…
                </div>
              ) : error ? (
                <div className="py-10 text-center text-xs text-red-500">
                  {error}
                </div>
              ) : (
                // 👇 Scroll is here, only the table area scrolls
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-500 border-b border-gray-100 sticky top-0 z-10">
                      <tr>
                        {[
                          { label: "Client", key: "client" },
                          { label: "LOB / Task" },
                          { label: "Status", key: "status" },
                          { label: "Live Date", key: "effectiveDate" },
                          { label: "Seats" },
                          { label: "Salesperson" },
                        ].map((col) => (
                          <th
                            key={col.label}
                            onClick={() => col.key && handleSort(col.key)}
                            className="px-4 py-2 text-left font-semibold text-xs text-gray-800 uppercase tracking-wide bg-gray-50 cursor-pointer hover:text-[#003b5c]"
                          >
                            {col.label}
                            {sortConfig.key === col.key && (
                              <span className="ml-1">
                                {sortConfig.direction === "asc" ? "▲" : "▼"}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-50">
                      {filteredClients.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-10 text-center text-gray-400 text-xs"
                          >
                            No clients to display. Try adjusting filters or
                            search.
                          </td>
                        </tr>
                      )}

                      {filteredClients.map((row) => {
                        const seats = (row.PHFTE || 0) + (row.DRFTE || 0);
                        const isSelected = selectedClientId === row.ID;
                        return (
                          <tr
                            key={row.ID}
                            className={`hover:bg-[#e1edf5]/60 cursor-pointer border-l-4 ${
                              isSelected
                                ? "border-[#00a1c9] bg-[#e1edf5]/60"
                                : "border-transparent"
                            }`}
                            onClick={() => {
                              setSelectedClientId(row.ID);
                              // setShowDetailsPanel(true); // 👈 auto open
                            }}
                            onDoubleClick={() => {
                              setSelectedClientId(row.ID);
                              setShowEditAsNewModal(true);
                            }}
                            title="Double click to edit"
                          >
                            <td className="px-4 py-2">
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-gray-900">
                                  {(row.ACCOUNT || "").toUpperCase()}
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {row.ACCOUNTCODE} · {row.SITE || "No site"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              <div className="flex flex-col max-w-[200px]">
                                {/* <span>{row.LOB || "-"}</span> */}
                                <span className="text-xs font-medium text-gray-900">
                                  {row.TASK || "-"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 w-32">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${
                                  (row.STATUS || "")
                                    .toLowerCase()
                                    .includes("risk")
                                    ? "bg-[#fff5ec] text-[#a35510] border-[#f58220]/40"
                                    : "bg-[#e0f7fd] text-[#003b5c] border-[#00a1c9]/40"
                                }`}
                              >
                                {row.STATUS || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {formatDate(row.LIVE_DATE || row.MSA_DATE)}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {seats || "-"}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {row.SALESPERSON || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>

        <ClientDetailsPanel
          client={selectedClient}
          onNotesUpdated={handleNotesUpdated}
          onEditAsNew={openEditAsNew}
          onRefresh={fetchRoster}
        />

        <AddClientModal
          isOpen={isAddClientOpen}
          onClose={() => {
            setIsAddClientOpen(false);
            fetchRoster(); // 🔥 refresh here
          }}
          onSave={() => {}} // no-op
          user={user}
        />

        <EditClientAsNewModal
          isOpen={showEditAsNewModal}
          onClose={() => {
            setShowEditAsNewModal(false);
            fetchRoster(); // 🔥 single refresh source
          }}
          onSave={() => {}} // no-op
          client={selectedClient}
          user={user}
        />
      </main>
    </div>
  );
};

export default ClientRosterPage;
