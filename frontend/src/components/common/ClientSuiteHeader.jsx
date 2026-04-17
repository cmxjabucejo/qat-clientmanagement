import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import cmxLogo from "../../assets/callmax_cover_removebg.png";
import { SERVER_URL } from "../lib/constants";

const ClientSuiteHeader = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  // ===============================
  // 🧠 USER DATA (SAFE FALLBACK)
  // ===============================
  const firstname = user?.firstName || "";
  const lastname = user?.lastName || "";
  const email = user?.userEmail || "";
  const accessLevel = user?.userLevel || "";

  const userName =
    (firstname && lastname && `${firstname} ${lastname}`) ||
    firstname ||
    lastname ||
    email ||
    "User";

  const initials =
    `${firstname.charAt(0)}${lastname.charAt(0)}`
      .toUpperCase()
      .trim() || "U";

  const isActive = (path) => location.pathname.startsWith(path);

  // ===============================
  // 🔐 LOGOUT (FIXED)
  // ===============================
  const handleLogout = async () => {
    try {
      await fetch(`${SERVER_URL}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout failed:", err);
    }

    // 🔥 Force clean state + redirect
    navigate("/OauthLogin", { replace: true });
    window.location.reload(); // ensures session reset
  };

  // ===============================
  // 🖱 CLICK OUTSIDE DROPDOWN
  // ===============================
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="bg-[#003b5c] text-white shadow-sm">
      <div className="h-18 pr-6 flex items-center justify-between relative">
        {/* LOGO */}
        <div className="flex items-center gap-3 py-2">
          <img
            src={cmxLogo}
            alt="Callmax Logo"
            className="h-12 object-contain"
          />
          <span className="text-2xl font-semibold tracking-tight">
            Client Management Suite
          </span>
        </div>

        {/* USER DROPDOWN */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 text-sm hover:bg-[#004a73] px-3 py-1 rounded transition"
          >
            <div className="w-7 h-7 rounded-full bg-cyan-500 flex items-center justify-center text-[11px] font-semibold">
              {initials}
            </div>

            <span className="hidden sm:inline text-white/90">
              {userName}
            </span>

            <svg
              className={`w-4 h-4 transition-transform duration-200 ${
                dropdownOpen ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* DROPDOWN MENU */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white text-gray-700 text-sm rounded-md shadow-lg z-50 overflow-hidden border border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 transition"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="px-6 bg-white border-b border-gray-200">
        <div className="flex gap-4 text-xs md:text-sm py-2">
          {accessLevel !== "User" && (
            <Link
              to="/ClientRoster"
              className={`transition-all ${
                isActive("/ClientRoster")
                  ? "text-[#003b5c] font-semibold border-b-2 border-[#003b5c]"
                  : "text-gray-700 hover:text-gray-900 hover:border-b-2 hover:border-gray-300"
              }`}
            >
              Client Roster
            </Link>
          )}

          <Link
            to="/ClientEscalations"
            className={`transition-all ${
              isActive("/ClientEscalations")
                ? "text-[#003b5c] font-semibold border-b-2 border-[#003b5c]"
                : "text-gray-700 hover:text-gray-900 hover:border-b-2 hover:border-gray-300"
            }`}
          >
            Client Escalations
          </Link>

          {accessLevel !== "User" && (
            <Link
              to="/VOCS"
              className={`transition-all ${
                isActive("/VOCS")
                  ? "text-[#003b5c] font-semibold border-b-2 border-[#003b5c]"
                  : "text-gray-700 hover:text-gray-900 hover:border-b-2 hover:border-gray-300"
              }`}
            >
              VOC Surveys
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
};

export default ClientSuiteHeader;