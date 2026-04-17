const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");
const { requireAuth } = require("../middleware/authMiddleware");

const s3 = new AWS.S3();
const ESCALATION_BUCKET = "cmxclientescalationfiles";

/*
==================================================
📧 EMAIL CONFIG
==================================================
*/
const transporter = nodemailer.createTransport({
  host: "email-smtp.us-east-1.amazonaws.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

/*
==================================================
🔐 HELPERS (HARDENED)
==================================================
*/
const MONTH_REGEX = /^\d{4} \(\d{2}\) [A-Z][a-z]{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateMonth = (month) => MONTH_REGEX.test(month || "");
const validateEmail = (email) => EMAIL_REGEX.test(email || "");

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const buildSurveyLink = ({ month, client, agentName, recipientName, email }) => {
  const baseUrl = "https://voc.cmxph.com/company-survey";

  const params = new URLSearchParams();
  params.append("month", month);
  params.append("client", client);
  params.append("agent", agentName);
  params.append("email", email);

  if (recipientName) params.append("name", recipientName);

  return `${baseUrl}?${params.toString()}`;
};

/*
==================================================
📧 EMAIL TEMPLATE
==================================================
*/
const getEmailHtml = ({
  month,
  client,
  emailType,
  recipientName,
  agentName,
  email,
}) => {
  const greeting = recipientName
    ? `Greetings, ${escapeHtml(recipientName)}`
    : "Greetings,";

  const audienceText =
    emailType === "individual" && recipientName
      ? "your recent interaction"
      : "your team's recent interactions";

  const surveyLink = buildSurveyLink({
    month,
    client,
    agentName,
    recipientName,
    email,
  });

  return `
  <div style="font-family: Arial, sans-serif; background:#f5f7fa; padding:20px;">
    <div style="max-width:600px; margin:auto; background:white; border-radius:10px; overflow:hidden;">

      <div style="background:#0b4a66; padding:20px; text-align:center;">
        <h2 style="color:white; margin:0;">
          Callmax Customer Experience Survey
        </h2>
      </div>

      <div style="padding:25px; color:#333; font-size:14px; line-height:1.6;">

        <p><strong>${greeting}</strong></p>

        <p>We hope this message finds you well.</p>

        <p>
          As part of our ongoing commitment to delivering excellent service to
          <strong>${escapeHtml(client)}</strong>, we would truly appreciate your feedback on
          <strong>${escapeHtml(audienceText)}</strong> handled by
          <strong>${escapeHtml(agentName)}</strong> during
          <strong>${escapeHtml(month)}</strong>.
        </p>

        <div style="text-align:center; margin:30px 0;">
          <a href="${surveyLink}"
             style="background:#0b4a66;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">
            Take the Survey
          </a>
        </div>

        <p>The survey should only take a few minutes to complete.</p>

      </div>
    </div>
  </div>
  `;
};

/*
==================================================
📊 GET SURVEY RESPONSES
==================================================
*/
router.get("/voc-responses", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        id,
        name,
        company,
        email,
        tasks,
        satisfaction,
        recommend,
        communication,
        collaboration,
        consistency,
        overall_comments,
        attachment_files,
        send_copy,
        submitted_at,
        survey_month AS month,
        agent
      FROM 1006_customer_survey_system.survey_responses
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("VOC FETCH ERROR:", err);
    res.status(500).json({ success: false, error: "Failed to fetch data" });
  }
});

/*
==================================================
📎 GET ATTACHMENT (SAFE)
==================================================
*/
router.get("/voc-attachment", requireAuth, async (req, res) => {
  try {
    const { key } = req.query;

    if (!key || key.includes("..")) {
      return res.status(400).json({
        success: false,
        message: "Invalid file key",
      });
    }

    const url = s3.getSignedUrl("getObject", {
      Bucket: ESCALATION_BUCKET,
      Key: key,
      Expires: 60,
    });

    res.json({ success: true, url });
  } catch (err) {
    console.error("S3 ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Failed to generate file URL",
    });
  }
});

/*
==================================================
📧 SEND SURVEY EMAIL (HARDENED)
==================================================
*/
router.post("/send-survey-email", requireAuth, async (req, res) => {
  try {
    const {
      month,
      client,
      emailType,
      email,
      recipientName,
      agentName,
      notes,
    } = req.body || {};

    // 🔐 VALIDATION
    if (!month || !client || !emailType || !email || !agentName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields.",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address.",
      });
    }

    if (!validateMonth(month)) {
      return res.status(400).json({
        success: false,
        message: "Invalid month format.",
      });
    }

    if (!["individual", "distro"].includes(emailType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email type.",
      });
    }

    if (emailType === "individual" && !recipientName) {
      return res.status(400).json({
        success: false,
        message: "Recipient name required.",
      });
    }

    const html = getEmailHtml({
      month,
      client,
      emailType,
      recipientName,
      agentName,
      email,
    });

    await transporter.sendMail({
      from: "Callmax Solutions <noreply@callmaxsolutions.com>",
      to: email,
      subject: `VOC Survey Request - ${month}`,
      html,
    });

    await db.execute(
      `INSERT INTO 1006_customer_survey_system.email_requests
       (month, client, email_type, email, recipient_name, agent_name, notes, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        month,
        client,
        emailType,
        email,
        recipientName || null,
        agentName,
        notes || null,
      ]
    );

    res.json({
      success: true,
      message: "Survey email sent",
    });

  } catch (err) {
    console.error("EMAIL ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send email",
    });
  }
});

/*
==================================================
📋 CLIENT LIST
==================================================
*/
router.get("/clients-active", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT DISTINCT ACCOUNT AS ClientList
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
      WHERE STATUS = 'Active'
      ORDER BY ClientList ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error("CLIENT FETCH ERROR:", err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

module.exports = router;