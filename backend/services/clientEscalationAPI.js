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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".docx", ".xlsx"];

    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."));

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(ext)
    ) {
      return cb(null, true);
    }

    return cb(new Error("Invalid file type"), false);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: "Failed to fetch escalations" });
  }
});

/*
========================================
➕ ADD ESCALATION (MULTIPLE FILES)
========================================
*/
router.post(
  "/add-escalation",
  requireAuth,
  upload.array("files", 10),
  async (req, res) => {
    try {
      let attachmentKeys = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
          const key = `uploads/${Date.now()}-${safeName}`;

          await s3.upload({
            Bucket: ESCALATION_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
          }).promise();

          attachmentKeys.push(key);
        }
      }

      await db.query(
        `INSERT INTO 1000_cmx_appdata_client_database.db_cmx_client_escalations (
          ESCALATIONID,
          ESCALATION_DATE,
          CLIENTCATEGORY,
          ACCOUNT,
          LOB,
          TASK,
          SITE,
          OIC,
          OIC_EMAIL,
          ESCALATIONTYPE,
          ESCALATIONDETAILS,
          CRITICALITY,
          STATUS,
          ATTACHMENT
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.body.escalationID,
          req.body.escalationDate,
          req.body.clientCategory,
          req.body.account,
          req.body.lob,
          req.body.task,
          req.body.site,
          req.body.oic,
          req.body.oicEmail,
          req.body.escalationType,
          req.body.escalationDetails,
          req.body.criticality,
          req.body.status || "Open",
          JSON.stringify(attachmentKeys),
        ]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("ADD ERROR:", err);

      if (err.message === "Invalid file type") {
        return res.status(400).json({
          error: "Only PNG, JPG, PDF, DOCX, XLSX allowed",
        });
      }

      res.status(500).json({ error: "Insert failed" });
    }
  }
);

/*
========================================
✏️ UPDATE ESCALATION (ADD FILES)
========================================
*/
router.post(
  "/updateEscalationInfo",
  requireAuth,
  upload.array("files", 10),
  async (req, res) => {
    try {
      let existing = [];

      try {
        existing = JSON.parse(req.body.attachment || "[]");
      } catch {
        existing = [];
      }

      let newFiles = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
          const key = `uploads/${Date.now()}-${safeName}`;

          await s3.upload({
            Bucket: ESCALATION_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
          }).promise();

          newFiles.push(key);
        }
      }

      const finalFiles = [...existing, ...newFiles];

      await db.query(
        `UPDATE 1000_cmx_appdata_client_database.db_cmx_client_escalations
        SET 
          VALIDITY = ?,
          REPORTSUBMITTED = ?,
          REPORTSUBMITTEDDATE = ?,
          RESOLVEDDATE = ?,
          ACTIONTAKEN = ?,
          RESOLUTIONSTATUS = ?,
          STATUS = ?,
          OIC = ?,
          OIC_EMAIL = ?,
          ATTACHMENT = ?,
          DATELASTUPDATED = ?
        WHERE ESCALATIONID = ?`,
        [
          req.body.validity,
          req.body.reportSubmitted,
          req.body.reportSubmittedDate || null,
          req.body.resolvedDate || null,
          req.body.actionTaken,
          req.body.resolutionStatus,
          req.body.status,
          req.body.oic,
          req.body.oicEmail,
          JSON.stringify(finalFiles),
          req.body.dateLastUpdated,
          req.body.escalationID
        ]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("UPDATE ERROR:", err);
      res.status(500).json({ error: "Update failed" });
    }
  }
);

router.get("/get-file", requireAuth, async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ error: "Missing file key" });
    }

    const params = {
      Bucket: ESCALATION_BUCKET,
      Key: key,
      Expires: 60 * 5, // 5 minutes
    };

    const url = s3.getSignedUrl("getObject", params);

    res.redirect(url); // 🔥 redirects to S3 file

  } catch (err) {
    console.error("GET FILE ERROR:", err);
    res.status(500).json({ error: "Failed to get file" });
  }
});

module.exports = router;