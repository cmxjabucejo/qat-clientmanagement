const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const AWS = require("aws-sdk");
const nodemailer = require("nodemailer");

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
  tls: {
    rejectUnauthorized: false,
  },
});

/*
==================================================
HELPERS
==================================================
*/
const MONTH_REGEX = /^\d{4} \(\d{2}\) [A-Z][a-z]{2}$/;

const validateMonth = (month) => MONTH_REGEX.test(month || "");

const formatMonthDisplay = (monthStr) => {
  const match = String(monthStr || "").match(/^(\d{4}) \((\d{2})\) (\w{3})$/);
  if (!match) return monthStr || "";

  const [, year, , shortMonth] = match;

  try {
    return new Date(`${shortMonth} 1, ${year}`).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return monthStr;
  }
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const nl2br = (value) => escapeHtml(value).replace(/\n/g, "<br/>");

const buildSurveyLink = ({
  month,
  client,
  agentName,
  recipientName,
  email,
}) => {
  const baseUrl = "https://voc.cmxph.com/company-survey";

    if (!baseUrl) {
      throw new Error("SURVEY_FRONTEND_URL is not defined.");
    }

  const params = new URLSearchParams();
  params.append("month", month);
  params.append("client", client);
  params.append("agent", agentName);
  params.append("email", email);

  if (recipientName) {
    params.append("name", recipientName);
  }

  return `${baseUrl}?${params.toString()}`;
};

/*
==================================================
EMAIL TEMPLATE
==================================================
*/
const getEmailHtml = ({
  month,
  client,
  emailType,
  recipientName,
  agentName,
  notes,
  email,
}) => {
  const displayMonth = formatMonthDisplay(month);

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
          <strong>${escapeHtml(displayMonth)}</strong>.
        </p>

        <p>
          Your feedback will help us better understand how we are performing
          and identify opportunities to further improve the quality of our services.
        </p>

        <div style="text-align:center; margin:30px 0;">
          <a href="${surveyLink}"
             style="
               background:#0b4a66;
               color:white;
               padding:12px 24px;
               text-decoration:none;
               border-radius:8px;
               display:inline-block;
               font-weight:bold;
             ">
            Take the Survey
          </a>
        </div>

        <p>The survey should only take a few minutes to complete.</p>

        <p>
          Thank you for taking the time to share your feedback and for your continued partnership with Callmax.
        </p>

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
router.get("/voc-responses", async (req, res) => {
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
        submitted_at
      FROM 1006_customer_survey_system.survey_responses
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("VOC FETCH ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/*
==================================================
📎 GET ATTACHMENT
==================================================
*/
router.get("/voc-attachment", async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Missing key",
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
      error: err.message,
    });
  }
});

/*
==================================================
📧 SEND SURVEY EMAIL
==================================================
*/
router.post("/send-survey-email", async (req, res) => {
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

    if (emailType === "individual" && !recipientName) {
      return res.status(400).json({
        success: false,
        message: "Recipient name is required for individual email type.",
      });
    }

    if (!validateMonth(month)) {
      return res.status(400).json({
        success: false,
        message: "Invalid month format. Expected: YYYY (MM) Mmm",
      });
    }

    if (!["individual", "distro"].includes(emailType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email type.",
      });
    }

    const html = getEmailHtml({
      month,
      client,
      emailType,
      recipientName,
      agentName,
      notes,
      email,
    });

    await transporter.sendMail({
      from: "noreply@callmaxsolutions.com",
      to: email,
      subject: `VOC Survey Request - ${month}`,
      html,
    });

    await db.execute(
      `
      INSERT INTO 1006_customer_survey_system.email_requests
      (
        month,
        client,
        email_type,
        email,
        recipient_name,
        agent_name,
        notes,
        sent_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `,
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
      message: `Survey email sent for ${month}`,
    });
  } catch (err) {
    console.error("EMAIL ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: err.message,
    });
  }
});

module.exports = router;