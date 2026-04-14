const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const AWS = require("aws-sdk");

const s3 = new AWS.S3();
const ESCALATION_BUCKET = "cmxclientescalationfiles";

router.get("/voc-responses", async (req, res) => {
  const [rows] = await db.execute(`
    SELECT * FROM 1006_customer_survey_system.survey_responses
  `);

  res.json({ success: true, data: rows });
});

router.get("/voc-attachment", async (req, res) => {
  const { key } = req.query;

  const url = s3.getSignedUrl("getObject", {
    Bucket: ESCALATION_BUCKET,
    Key: key,
    Expires: 60,
  });

  res.json({ success: true, url });
});

router.post("/send-survey-email", async (req, res) => {
  res.json({ success: true });
});

module.exports = router;