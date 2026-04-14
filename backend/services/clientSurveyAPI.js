const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const AWS = require("aws-sdk");

const s3 = new AWS.S3();
const ESCALATION_BUCKET = "cmxclientescalationfiles";

// ===============================
// 📊 GET SURVEY RESPONSES
// ===============================
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

    console.log("VOC SAMPLE ROW:", rows[0]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("VOC FETCH ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===============================
// 📎 GET ATTACHMENT (S3 SIGNED URL)
// ===============================
router.get("/voc-attachment", async (req, res) => {
  try {
    const { key } = req.query;

    console.log("S3 KEY RECEIVED:", key);

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

// ===============================
// 📧 SEND SURVEY EMAIL
// ===============================
router.post("/send-survey-email", async (req, res) => {
  res.json({ success: true });
});

module.exports = router;