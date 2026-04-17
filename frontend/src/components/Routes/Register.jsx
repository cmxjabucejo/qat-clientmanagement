import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../../assets/cmxlogo-removebg-preview.png";
import { SERVER_URL } from "../lib/constants";
import UserService from "../../service/UserService";
import { apiFetch } from "../lib/apiFetch";

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workedInBpo, setWorkedInBpo] = useState("");
  const [amenableToGraveyard, setAmenableToGraveyard] = useState("");

  useEffect(() => {
    if (location.state?.provider === "google") {
      setFirstname(location.state.firstname || "");
      setLastname(location.state.lastname || "");
      setEmail(location.state.email || "");
      localStorage.setItem(
        "applicationId",
        `google_${location.state.provider_id}`
      );
      localStorage.setItem(
        "applicantPicture",
        location.state.picture || "/default-avatar.png"
      );
      // You can set other values in localStorage if needed
    }
  }, []);

  const handleRegister = async () => {
    setError("");
    setSuccess("");

    const trimmedFirst = firstname.trim();
    const trimmedLast = lastname.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phoneNumber.trim();
    const isGoogle = location.state?.provider === "google";

    if (
      !trimmedFirst ||
      !trimmedLast ||
      !trimmedEmail ||
      !trimmedPhone ||
      workedInBpo === "" ||
      amenableToGraveyard === ""
    ) {
      setError("All fields are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const registerRes = await apiFetch(`${SERVER_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: isGoogle ? "google" : "password",
          provider_id: isGoogle ? location.state?.provider_id : null,
          email: trimmedEmail,
          phone_num: trimmedPhone,
          firstname: trimmedFirst,
          lastname: trimmedLast,
          worked_in_bpo: workedInBpo === "yes" ? 1 : 0,
          amenable_graveyard: amenableToGraveyard === "yes" ? 1 : 0,
        }),
      });

      const data = await registerRes.json();

      if (registerRes.status === 409) {
        setError(data.message || "This email is already registered.");
        return;
      }

      if (!registerRes.ok || !data.success) {
        setError(data.message || "Registration failed.");
        return;
      }

      if (isGoogle && registerRes.status === 200) {
        // Google registration successful — authenticate and go to Applications
        UserService.loginApplicant({
          email: trimmedEmail,
          firstname: trimmedFirst,
          lastname: trimmedLast,
          picture:
            localStorage.getItem("applicantPicture") || "/default-avatar.png",
          method: "google",
          providerId: location.state?.provider_id,
        });

        // ✅ Google registration successful — go to Applications
        navigate("/Applications", {
          state: { appId: `google_${location.state.provider_id}` },
        });
        return;
      }

      if (!isGoogle && registerRes.status === 202) {
        // ✅ Manual registration — send OTP and proceed

        // Save form data in localStorage for use after OTP
        localStorage.setItem(
          "pendingUserData",
          JSON.stringify({
            firstname: trimmedFirst,
            lastname: trimmedLast,
            phone_num: trimmedPhone,
            worked_in_bpo: workedInBpo === "yes" ? 1 : 0,
            amenable_graveyard: amenableToGraveyard === "yes" ? 1 : 0,
            middlename: "",
          })
        );

        const requestedDateTime = new Date();
        const expiryDateTime = new Date(
          requestedDateTime.getTime() + 5 * 60000
        );

        const otpRes = await apiFetch(`${SERVER_URL}/sendOTP`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailAddress: trimmedEmail,
            requestedDateTime: requestedDateTime.toISOString(),
            expiryDateTime: expiryDateTime.toISOString(),
          }),
        });

        if (!otpRes.ok) {
          setError("Failed to send OTP. Please try again.");
          return;
        }

        const otpResult = await otpRes.json();
        localStorage.setItem("pendingOtpHashed", otpResult.otpHashed);

        navigate("/OTP-SECURE", {
          state: {
            emailAddress: trimmedEmail,
            requestedDateTime,
            expiryDateTime,
          },
        });

        return;
      }

      setError("Unexpected registration flow. Please try again.");
    } catch (err) {
      console.error("Registration error:", err);
      setError("An error occurred during registration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-linear-gradient px-4">
      <div className="bg-white p-8 md:p-10 rounded-lg shadow-xl w-full max-w-lg text-center">
        <img
          src={logo}
          alt="Callmax Logo"
          className="w-28 sm:w-32 md:w-36 lg:w-40 xl:w-44 mx-auto mb-6 max-w-full h-auto"
        />
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Create Account
        </h2>

        <div className="space-y-3 text-left">
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="First Name"
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Last Name"
              value={lastname}
              onChange={(e) => setLastname(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center border rounded px-3 py-2 w-full bg-white">
              {/* PH flag image */}
              <img
                src="https://flagcdn.com/w40/ph.png"
                alt="PH Flag"
                className="w-5 h-5 mr-2"
              />

              {/* Static +63 prefix */}
              <span className="mr-2 text-gray-700 text-sm">+63</span>

              {/* Input for 9XXXXXXXXX */}
              <input
                type="tel"
                placeholder="9XXXXXXXXX"
                value={phoneNumber}
                onChange={(e) => {
                  const input = e.target.value.replace(/\D/g, ""); // Remove non-digits
                  if (input.length <= 10) setPhoneNumber(input); // Max 10 digits
                }}
                className="flex-1 outline-none text-sm"
                pattern="[9]{1}[0-9]{9}"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Have you worked with a BPO company or (TPA) Third Party
              Association? <span className="text-red-500">*</span>
            </label>
            <select
              value={workedInBpo}
              onChange={(e) => setWorkedInBpo(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Select an option</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Are you amenable to work graveyard shift and shifting schedules?{" "}
              <span className="text-red-500">*</span>
            </label>
            <select
              value={amenableToGraveyard}
              onChange={(e) => setAmenableToGraveyard(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Select an option</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        <div className="text-sm text-center mt-4">
          <button
            onClick={handleRegister}
            disabled={isSubmitting}
            className={`bg-[#162950] hover:bg-[#1c365f] text-white w-full py-2 rounded mt-1 mb-2 ${
              isSubmitting ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting ? "Registering..." : "Register"}
          </button>
          Already have an account?{" "}
          <span
            className="text-blue-600 hover:underline cursor-pointer"
            onClick={() => navigate("/OauthLogin")}
          >
            Login here
          </span>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
        {success && <p className="text-green-600 text-sm mt-3">{success}</p>}
      </div>
    </div>
  );
};

export default Register;
