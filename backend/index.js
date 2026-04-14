const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const AWS = require("aws-sdk");

dotenv.config();

// ===============================
// 🌐 AWS CONFIG
// ===============================
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// ===============================
// 🚀 APP INIT
// ===============================
const app = express();
const PORT = process.env.SERVER_PORT || 5005;

// ===============================
// 🔧 MIDDLEWARE
// ===============================
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// ===============================
// 📦 IMPORT ROUTES
// ===============================
const authAPI = require("./services/authAPI");
const clientRosterAPI = require("./services/clientRosterAPI");
const clientEscalationAPI = require("./services/clientEscalationAPI");
const clientSurveyAPI = require("./services/clientSurveyAPI");

// ===============================
// 🚀 USE ROUTES
// ===============================
app.use("/api", authAPI);
app.use("/api", clientRosterAPI);
app.use("/api", clientEscalationAPI);
app.use("/api", clientSurveyAPI);

// ===============================
// ❤️ HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
  res.send("CMX API running 🚀");
});

// ===============================
// 🚀 START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});