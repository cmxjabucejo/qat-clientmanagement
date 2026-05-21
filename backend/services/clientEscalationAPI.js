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
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 3, // max 3 files
  },
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

    const allowedExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".pdf",
      ".docx",
      ".xlsx",
    ];

    const originalName = String(file.originalname || "").toLowerCase();
    const ext = originalName.substring(originalName.lastIndexOf("."));

    if (
      allowedMimeTypes.includes(file.mimetype) &&
      allowedExtensions.includes(ext)
    ) {
      return cb(null, true);
    }

    return cb(new Error("Invalid file type"), false);
  },
});

/*
========================================
🔐 HELPERS
========================================
*/
function isAdminUser(req) {
  const role = String(req.session?.user?.userLevel || "")
    .trim()
    .toLowerCase();

  return role === "admin" || role === "super admin";
}

function getSessionEmail(req) {
  return String(req.session?.user?.userEmail || req.session?.user?.userid || "")
    .trim()
    .toLowerCase();
}

function safeUploadFileName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);
}

function isSafeEscalationFileKey(key) {
  if (!key || typeof key !== "string") return false;
  if (key.includes("..")) return false;
  if (key.includes("\\")) return false;
  if (!key.startsWith("uploads/")) return false;

  return true;
}

function parseAttachmentList(value) {
  try {
    if (!value) return [];
    if (Array.isArray(value)) return value;

    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

    return res.json({ maxId: rows[0]?.escalmaxID || 0 });
  } catch (err) {
    console.error("ESCALATION MAX ID ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch max escalation ID",
    });
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

    return res.json(rows);
  } catch (err) {
    console.error("OIC LIST ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch OIC list",
    });
  }
});

/*
========================================
📋 GET ESCALATIONS
Admin/Super Admin: all records
Regular users: only records where OIC_EMAIL = session email
========================================
*/
router.get("/escalations", requireAuth, async (req, res) => {
  try {
    const userIsAdmin = isAdminUser(req);
    const userEmail = getSessionEmail(req);

    if (!userIsAdmin && !userEmail) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
      });
    }

    let rows;

    if (userIsAdmin) {
      const [result] = await db.query(`
        SELECT *
        FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations
        ORDER BY ESCALATION_DATE DESC, ID DESC
      `);

      rows = result;
    } else {
      const [result] = await db.query(
        `
        SELECT *
        FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations
        WHERE LOWER(TRIM(OIC_EMAIL)) = ?
        ORDER BY ESCALATION_DATE DESC, ID DESC
        `,
        [userEmail]
      );

      rows = result;
    }

    return res.json({
      success: true,
      data: rows,
      scope: userIsAdmin ? "all" : "assigned",
    });
  } catch (err) {
    console.error("ESCALATIONS FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch escalations",
    });
  }
});

/*
========================================
➕ ADD ESCALATION
Authenticated users may add escalations
========================================
*/
router.post(
  "/add-escalation",
  requireAuth,
  upload.array("files", 3),
  async (req, res) => {
    try {
      const attachmentKeys = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const safeName = safeUploadFileName(file.originalname);
          const key = `uploads/${Date.now()}-${safeName}`;

          await s3
            .upload({
              Bucket: ESCALATION_BUCKET,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            })
            .promise();

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

      return res.json({ success: true });
    } catch (err) {
      console.error("ADD ESCALATION ERROR:", err);

      if (err.message === "Invalid file type") {
        return res.status(400).json({
          success: false,
          error: "Only PNG, JPG, WEBP, PDF, DOCX, and XLSX files are allowed.",
        });
      }

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "One or more files exceeded the 5MB limit.",
        });
      }

      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          success: false,
          error: "Maximum of 3 files allowed.",
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
✏️ UPDATE ESCALATION
Admin/Super Admin:
- Can update all records
- Can update STATUS and RESOLVEDDATE

Regular users:
- Can only update escalations assigned to their OIC_EMAIL
- Cannot overwrite STATUS and RESOLVEDDATE
========================================
*/
router.post(
  "/updateEscalationInfo",
  requireAuth,
  upload.array("files", 3),
  async (req, res) => {
    try {
      const userIsAdmin = isAdminUser(req);
      const userEmail = getSessionEmail(req);

      if (!req.body.escalationID) {
        return res.status(400).json({
          success: false,
          error: "Missing escalation ID",
        });
      }

      let existing = parseAttachmentList(req.body.attachment);
      const newFiles = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const safeName = safeUploadFileName(file.originalname);
          const key = `uploads/${Date.now()}-${safeName}`;

          await s3
            .upload({
              Bucket: ESCALATION_BUCKET,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            })
            .promise();

          newFiles.push(key);
        }
      }

      const finalFiles = [...existing, ...newFiles];

      /*
      ========================================
      FETCH CURRENT RECORD
      Needed so:
      - non-admins cannot update records assigned to other OICs
      - non-admins cannot overwrite admin-only fields
      ========================================
      */
      const [existingRows] = await db.query(
        `SELECT STATUS, RESOLVEDDATE, OIC_EMAIL
         FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations
         WHERE ESCALATIONID = ?
         LIMIT 1`,
        [req.body.escalationID]
      );

      if (!existingRows.length) {
        return res.status(404).json({
          success: false,
          error: "Escalation not found",
        });
      }

      const currentRecord = existingRows[0];
      const currentOicEmail = String(currentRecord.OIC_EMAIL || "")
        .trim()
        .toLowerCase();

      if (!userIsAdmin && (!userEmail || currentOicEmail !== userEmail)) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
        });
      }

      /*
      ========================================
      ADMIN-ONLY FIELDS
      Only Admin / Super Admin can change:
      - STATUS
      - RESOLVEDDATE
      ========================================
      */
      const finalStatus = userIsAdmin ? req.body.status : currentRecord.STATUS;

      const finalResolvedDate = userIsAdmin
        ? req.body.resolvedDate || null
        : currentRecord.RESOLVEDDATE;

      /*
      ========================================
      OIC REASSIGNMENT
      Only Admin / Super Admin can change:
      - OIC
      - OIC_EMAIL
      ========================================
      */
      const finalOic = userIsAdmin ? req.body.oic : undefined;
      const finalOicEmail = userIsAdmin ? req.body.oicEmail : undefined;

      if (userIsAdmin) {
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
            finalResolvedDate,
            req.body.actionTaken,
            req.body.resolutionStatus,
            finalStatus,
            finalOic,
            finalOicEmail,
            JSON.stringify(finalFiles),
            req.body.dateLastUpdated,
            req.body.escalationID,
          ]
        );
      } else {
        await db.query(
          `UPDATE 1000_cmx_appdata_client_database.db_cmx_client_escalations
           SET
            VALIDITY = ?,
            REPORTSUBMITTED = ?,
            REPORTSUBMITTEDDATE = ?,
            ACTIONTAKEN = ?,
            RESOLUTIONSTATUS = ?,
            ATTACHMENT = ?,
            DATELASTUPDATED = ?
           WHERE ESCALATIONID = ?
             AND LOWER(TRIM(OIC_EMAIL)) = ?`,
          [
            req.body.validity,
            req.body.reportSubmitted,
            req.body.reportSubmittedDate || null,
            req.body.actionTaken,
            req.body.resolutionStatus,
            JSON.stringify(finalFiles),
            req.body.dateLastUpdated,
            req.body.escalationID,
            userEmail,
          ]
        );
      }

      return res.json({
        success: true,
        adminFieldsUpdated: userIsAdmin,
      });
    } catch (err) {
      console.error("UPDATE ESCALATION ERROR:", err);

      if (err.message === "Invalid file type") {
        return res.status(400).json({
          success: false,
          error: "Only PNG, JPG, WEBP, PDF, DOCX, and XLSX files are allowed.",
        });
      }

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "One or more files exceeded the 5MB limit.",
        });
      }

      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          success: false,
          error: "Maximum of 3 files allowed.",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Update failed",
      });
    }
  }
);

/*
========================================
📎 GET ESCALATION FILE
Admin/Super Admin:
- Can access any file attached to an escalation

Regular users:
- Can only access files attached to escalations where OIC_EMAIL = session email
========================================
*/
router.get("/get-file", requireAuth, async (req, res) => {
  try {
    const { key } = req.query;
    const userIsAdmin = isAdminUser(req);
    const userEmail = getSessionEmail(req);

    if (!isSafeEscalationFileKey(key)) {
      return res.status(400).json({
        success: false,
        error: "Invalid file key",
      });
    }

    let rows;

    if (userIsAdmin) {
      const [result] = await db.query(
        `
        SELECT ESCALATIONID
        FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations
        WHERE JSON_CONTAINS(ATTACHMENT, JSON_QUOTE(?))
        LIMIT 1
        `,
        [key]
      );

      rows = result;
    } else {
      if (!userEmail) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
        });
      }

      const [result] = await db.query(
        `
        SELECT ESCALATIONID
        FROM 1000_cmx_appdata_client_database.db_cmx_client_escalations
        WHERE JSON_CONTAINS(ATTACHMENT, JSON_QUOTE(?))
          AND LOWER(TRIM(OIC_EMAIL)) = ?
        LIMIT 1
        `,
        [key, userEmail]
      );

      rows = result;
    }

    if (!rows.length) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
      });
    }

    const url = s3.getSignedUrl("getObject", {
      Bucket: ESCALATION_BUCKET,
      Key: key,
      Expires: 60 * 5,
    });

    return res.redirect(url);
  } catch (err) {
    console.error("GET ESCALATION FILE ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to get file",
    });
  }
});

module.exports = router;