const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const multer = require("multer");
const AWS = require("aws-sdk");

/*
========================================
AWS / S3
========================================
*/
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

/*
========================================
ROLE ACCESS
========================================
*/
const adminAccess = [requireAuth, requireRole("Admin", "Super Admin")];

/*
========================================
UPLOAD CONFIG (HARDENED)
========================================
*/
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
      return cb(new Error("Invalid file type"));
    }

    cb(null, true);
  },
});

/*
========================================
HELPERS
========================================
*/
const normalizeDate = (val) => {
  if (!val) return null;

  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
};

const normalizeNumber = (val) => {
  if (val === "" || val === null || val === undefined) return null;

  const num = Number(val);
  return Number.isNaN(num) ? null : num;
};

const safeString = (val, maxLen = 255) => {
  if (val === null || val === undefined) return null;
  return String(val).trim().slice(0, maxLen);
};

const safeLongText = (val) => {
  if (val === null || val === undefined) return null;
  return String(val).trim();
};

const safeFilename = (name) => {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
};

const formatNoteEntry = (first, last, rawNote) => {
  const now = new Date();

  const options = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };

  const timestamp = now.toLocaleString("en-US", options).replace(",", "");
  const safeFirst = safeString(first, 100) || "Unknown";
  const safeLast = safeString(last, 100) || "User";

  return `---- ${safeFirst} ${safeLast} || ${timestamp} ----\n\n${
    safeLongText(rawNote) || ""
  }`;
};

const parseAttachments = (value) => {
  try {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const dedupeAttachments = (files) => {
  return files.filter(
    (file, index, self) =>
      index === self.findIndex((f) => f.url === file.url)
  );
};

const isSafeS3Key = (key) => {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..")) return false;
  if (key.includes("\\")) return false;
  if (!key.startsWith("clientRecordsAttachmentFolder/")) return false;

  return true;
};

/*
========================================
GET CLIENT ROSTER
Admin / Super Admin only
========================================
*/
router.get("/client-roster", ...adminAccess, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t1.*
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster t1
      INNER JOIN (
        SELECT ACCOUNTCODE, MAX(ID) AS max_id
        FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
        GROUP BY ACCOUNTCODE
      ) t2
      ON t1.ID = t2.max_id
      ORDER BY t1.ID DESC
    `);

    const formatted = rows.map((row) => ({
      ...row,
      ATTACHMENTS: parseAttachments(row.ATTACHMENTS),
    }));

    return res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error("ROSTER FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to load client roster",
    });
  }
});

/*
========================================
INSERT CLIENT + ATTACHMENTS
Admin / Super Admin only
========================================
*/
router.post(
  "/client-roster",
  ...adminAccess,
  upload.array("attachments", 10),
  async (req, res) => {
    try {
      const data = { ...req.body };
      const existingAttachments = parseAttachments(data.existingAttachments);
      const files = req.files || [];

      /*
      ========================================
      VALIDATION
      ========================================
      */
      const requiredFields = ["account", "lob", "task"];

      for (const field of requiredFields) {
        if (!data[field] || !String(data[field]).trim()) {
          return res.status(400).json({
            success: false,
            error: `${field.toUpperCase()} is required`,
          });
        }
      }

      /*
      ========================================
      UPLOAD FILES TO S3
      ========================================
      */
      const uploadedFiles = [];

      for (const file of files) {
        const cleanedName = safeFilename(file.originalname);
        const key = `clientRecordsAttachmentFolder/${Date.now()}_${cleanedName}`;

        await s3
          .upload({
            Bucket: process.env.S3_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
          })
          .promise();

        uploadedFiles.push({
          name: cleanedName,
          url: key,
        });
      }

      /*
      ========================================
      ATTACHMENTS
      ========================================
      */
      const finalAttachments = dedupeAttachments([
        ...existingAttachments,
        ...uploadedFiles,
      ]);

      const attachmentsJson = JSON.stringify(finalAttachments);

      /*
      ========================================
      VALUES
      ========================================
      */
      const values = [
        normalizeDate(data.effectiveDate),

        safeString(data.accountCode) || null,
        safeString(data.qbAccount) || null,

        safeString(data.account) || null,
        safeString(data.lob) || null,
        safeString(data.task) || null,

        normalizeDate(data.msaDate),
        normalizeDate(data.liveDate),

        safeString(data.site) || null,
        safeString(data.workSetup) || null,
        safeString(data.staffingModel) || null,

        normalizeNumber(data.drfte),
        normalizeNumber(data.phfte),
        normalizeNumber(data.dailyWorkHrs),
        normalizeNumber(data.holidayHrs),

        normalizeNumber(data.regularRate),
        normalizeNumber(data.premiumRate),

        normalizeNumber(data.depositFee),
        safeString(data.depositFeeWaived, 50) || null,

        normalizeNumber(data.setupFee),
        safeString(data.setupFeeWaived, 50) || null,

        normalizeNumber(data.extraMonitorFeePerUnit),
        normalizeNumber(data.extraMonitorQty),

        normalizeNumber(data.phoneLineFeePerFTEPerMonth),

        safeString(data.billingCycle) || null,
        safeString(data.status) || null,

        safeString(data.busAddress, 500) || null,
        safeString(data.state, 100) || null,

        safeString(data.contact1, 255) || null,
        safeString(data.contactNo1, 100) || null,

        safeString(data.contact2, 255) || null,
        safeString(data.contactNo2, 100) || null,

        safeString(data.salesperson, 255) || null,

        safeLongText(data.notes),
        safeLongText(data.specialInstructions),

        attachmentsJson,

        normalizeDate(data.termDate),
      ];

      /*
      ========================================
      INSERT
      ========================================
      */
      const [result] = await db.execute(
        `INSERT INTO 1000_cmx_appdata_client_database.db_cmx_client_roster (
          EFFECTIVEDATE, ACCOUNTCODE, QBACCOUNT, ACCOUNT, LOB, TASK,
          MSA_DATE, LIVE_DATE, SITE, WORKSETUP, STAFFINGMODEL,
          DRFTE, PHFTE, DAILYWORKHRS, HOLIDAYHRS, REGULARRATE,
          PREMIUMRATE, DEPOSITFEE, DEPOSITFEEWAIVED,
          SETUPFEE, SETUPFEEWAIVED,
          EXTRAMONITORFEEPERUNIT, EXTRAMONITORQTY,
          PHONELINEFEEPERFTEPERMONTH,
          BILLINGCYCLE, STATUS, BUSADDRESS, STATE,
          CONTACT1, CONTACTNO1, CONTACT2, CONTACTNO2,
          SALESPERSON, NOTES, SPECIAL_INSTRUCTIONS, ATTACHMENTS, TERMDATE
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        values
      );

      return res.json({
        success: true,
        id: result.insertId,
        attachments: uploadedFiles,
      });
    } catch (err) {
      console.error("CLIENT ROSTER INSERT ERROR:", err);

      if (err.message === "Invalid file type") {
        return res.status(400).json({
          success: false,
          error:
            "Invalid file type. Allowed: PDF, PNG, JPG, DOC, DOCX, XLS, XLSX",
        });
      }

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "One or more files exceeded the 10MB limit.",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Insert failed",
      });
    }
  }
);

/*
========================================
UPDATE NOTES
Admin / Super Admin only
========================================
*/
router.put("/client-roster/:id/notes", ...adminAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { note, userFirstName, userLastName } = req.body || {};

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing record ID",
      });
    }

    const newBlock = formatNoteEntry(userFirstName, userLastName, note);

    const [rows] = await db.execute(
      `SELECT NOTES
       FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
       WHERE ID = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "Client roster record not found",
      });
    }

    const existing = rows[0]?.NOTES || "";
    const updated = existing ? `${existing}\n\n${newBlock}` : newBlock;

    await db.execute(
      `UPDATE 1000_cmx_appdata_client_database.db_cmx_client_roster
       SET NOTES = ?
       WHERE ID = ?`,
      [updated, id]
    );

    return res.json({
      success: true,
      notes: updated,
    });
  } catch (err) {
    console.error("UPDATE NOTES ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Update failed",
    });
  }
});

/*
========================================
ACCOUNT DETAILS
Admin / Super Admin only
========================================
*/
router.get("/accountDetails", ...adminAccess, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
      WHERE STATUS = 'Active'
    `);

    return res.json(rows);
  } catch (err) {
    console.error("ACCOUNT DETAILS ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "DB error",
    });
  }
});

/*
========================================
CLIENTS
Admin / Super Admin only
========================================
*/
router.get("/clients", ...adminAccess, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT DISTINCT ACCOUNT
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
      WHERE STATUS = 'Active'
      ORDER BY ACCOUNT ASC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("CLIENTS FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Error fetching clients",
    });
  }
});

/*
========================================
CLIENT ATTACHMENT SIGNED URL
Admin / Super Admin only
========================================
*/
router.get("/client-attachment", ...adminAccess, async (req, res) => {
  try {
    const { key } = req.query;

    if (!isSafeS3Key(key)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attachment key",
      });
    }

    const url = s3.getSignedUrl("getObject", {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Expires: 60,
    });

    return res.json({
      success: true,
      url,
    });
  } catch (err) {
    console.error("CLIENT ATTACHMENT ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to generate attachment URL",
    });
  }
});

module.exports = router;