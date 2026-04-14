const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const AWS = require("aws-sdk");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });
const s3 = new AWS.S3();
const ESCALATION_BUCKET = "cmxclientescalationfiles";

router.get("/escalMaxId", async (req, res) => {
  const [rows] = await db.query(
    "SELECT MAX(ID) as escalmaxID FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations"
  );
  res.json({ maxId: rows[0]?.escalmaxID || 0 });
});

router.get("/oicList", async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM 1000_cmx_appdata_client_database.db_cmx_oiclist"
  );
  res.json(rows);
});

router.get("/escalations", async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations"
  );
  res.json({ success: true, data: rows });
});

router.post("/add-escalation", upload.single("file"), async (req, res) => {
  try {
    let attachmentKey = null;

    if (req.file) {
      attachmentKey = `uploads/${Date.now()}-${req.file.originalname}`;

      await s3
        .upload({
          Bucket: ESCALATION_BUCKET,
          Key: attachmentKey,
          Body: req.file.buffer,
        })
        .promise();
    }

    await db.query(
      `INSERT INTO 1000_cmx_appdata_client_database.db_cmx_client_escalations (ESCALATIONID, ACCOUNT, ATTACHMENT)
       VALUES (?, ?, ?)`,
      [req.body.escalationID, req.body.account, attachmentKey]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Insert error" });
  }
});

router.post("/updateEscalationInfo", async (req, res) => {
  res.json({ success: true });
});

module.exports = router;