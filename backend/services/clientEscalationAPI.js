const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const AWS = require("aws-sdk");
const multer = require("multer");
const { requireAuth } = require("../middleware/authMiddleware");

const s3 = new AWS.S3();
const ESCALATION_BUCKET = "cmxclientescalationfiles";

/*
========================================
🔐 MULTER (HARDENED)
========================================
*/
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Invalid file type"), false);
    }

    cb(null, true);
  },
});

/*
========================================
📊 MAX ESCALATION ID
========================================
*/
router.get("/escalMaxId", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT MAX(ID) as escalmaxID FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations"
    );

    res.json({ maxId: rows[0]?.escalmaxID || 0 });

  } catch (err) {
    console.error("ESCAL MAX ID ERROR:", err);
    res.status(500).json({ error: "Failed to fetch max escalation ID" });
  }
});

/*
========================================
👤 OIC LIST
========================================
*/
router.get("/oicList", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM 1000_cmx_appdata_client_database.db_cmx_oiclist"
    );

    res.json(rows);

  } catch (err) {
    console.error("OIC LIST ERROR:", err);
    res.status(500).json({ error: "Failed to fetch OIC list" });
  }
});

/*
========================================
📋 GET ESCALATIONS
========================================
*/
router.get("/escalations", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations"
    );

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("ESCALATIONS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch escalations" });
  }
});

/*
========================================
➕ ADD ESCALATION
========================================
*/
router.post(
  "/add-escalation",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      let attachmentKey = null;

      if (req.file) {
        // 🔐 SAFE FILE NAME
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");

        attachmentKey = `uploads/${Date.now()}-${safeName}`;

        await s3
          .upload({
            Bucket: ESCALATION_BUCKET,
            Key: attachmentKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          })
          .promise();
      }

      await db.query(
        `INSERT INTO 1000_cmx_appdata_client_database.db_cmx_client_escalations 
         (ESCALATIONID, ACCOUNT, ATTACHMENT)
         VALUES (?, ?, ?)`,
        [req.body.escalationID, req.body.account, attachmentKey]
      );

      res.json({ success: true });

    } catch (err) {
      console.error("ADD ESCALATION ERROR:", err);

      // Handle multer file errors cleanly
      if (err.message === "Invalid file type") {
        return res.status(400).json({
          error: "Only PNG, JPG, and PDF files are allowed",
        });
      }

      res.status(500).json({ error: "Insert failed" });
    }
  }
);

/*
========================================
✏️ UPDATE ESCALATION (PLACEHOLDER)
========================================
*/
router.post("/updateEscalationInfo", requireAuth, async (req, res) => {
  try {
    // TODO: implement actual update logic

    res.json({ success: true });

  } catch (err) {
    console.error("UPDATE ESCALATION ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

module.exports = router;