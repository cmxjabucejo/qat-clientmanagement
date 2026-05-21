const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

const s3 = new AWS.S3();
const ESCALATION_BUCKET = "cmxclientescalationfiles";

/*
==================================================
🔐 ROLE ACCESS
==================================================
*/
const adminAccess = [requireAuth, requireRole("Admin", "Super Admin")];

/*
==================================================
📧 EMAIL CONFIG
==================================================
*/
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
  },
});

/*
==================================================
🔐 HELPERS
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

const isSafeSurveyAttachmentKey = (key) => {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..")) return false;
  if (key.includes("\\")) return false;

  // Adjust this if your VOC files are stored under a different fixed folder.
  // This prevents users from requesting arbitrary S3 keys.
  const allowedPrefixes = [
    "surveyAttachments/",
    "vocAttachments/",
    "uploads/",
  ];

  return allowedPrefixes.some((prefix) => key.startsWith(prefix));
};

const buildSurveyLink = ({ month, client, agentName, recipientName, email }) => {
  const baseUrl = process.env.VOC_SURVEY_URL || "https://voc.cmxph.com/company-survey";

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
const formatMonthDisplay = (month) => {
  const match = String(month || "").match(/^(\d{4}) \((\d{2})\)/);
  if (!match) return month;

  const year = match[1];
  const monthIndex = parseInt(match[2], 10) - 1;

  const date = new Date(year, monthIndex);

  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
};

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
      ? "the services and support provided to you"
      : "the services and support provided to your team";

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
          <strong>${escapeHtml(client)}</strong>, we would truly appreciate your feedback on ${escapeHtml(audienceText)}
          through <strong>${escapeHtml(agentName)}</strong> during the month of
          <strong>${escapeHtml(formatMonthDisplay(month))}</strong>.
        </p>

        <div style="text-align:center; margin:30px 0;">
          <a href="${escapeHtml(surveyLink)}"
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
Admin / Super Admin only
==================================================
*/
router.get("/voc-responses", ...adminAccess, async (req, res) => {
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
      ORDER BY submitted_at DESC
    `);

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("VOC FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch data",
    });
  }
});

/*
==================================================
📎 GET VOC ATTACHMENT
Admin / Super Admin only
==================================================
*/
router.get("/voc-attachment", ...adminAccess, async (req, res) => {
  try {
    const { key } = req.query;

    if (!isSafeSurveyAttachmentKey(key)) {
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

    return res.json({
      success: true,
      url,
    });
  } catch (err) {
    console.error("VOC ATTACHMENT S3 ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to generate file URL",
    });
  }
});

/*
==================================================
📧 SEND SURVEY EMAIL
Admin / Super Admin only
==================================================
*/
router.post("/send-survey-email", ...adminAccess, async (req, res) => {
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
      from: process.env.EMAIL_FROM || "Callmax Solutions <noreply@callmaxsolutions.com>",
      to: email,
      subject: `VOC Survey Request - ${formatMonthDisplay(month)}`,
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

    return res.json({
      success: true,
      message: "Survey email sent",
    });
  } catch (err) {
    console.error("SEND SURVEY EMAIL ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to send email",
    });
  }
});

/*
==================================================
📋 CLIENT LIST
Admin / Super Admin only
==================================================
*/
router.get("/clients-active", ...adminAccess, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT DISTINCT ACCOUNT AS ClientList
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
      WHERE STATUS = 'Active'
      ORDER BY ClientList ASC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("CLIENT FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch clients",
    });
  }
});

module.exports = router;