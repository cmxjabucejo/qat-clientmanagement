const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");

const multer = require("multer");
const AWS = require("aws-sdk");

/*
========================================
UPLOAD CONFIG
========================================
*/
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

/*
========================================
HELPERS
========================================
*/
const normalizeDate = (val) => {
  if (!val) return null;
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  return trimmed === "" ? null : trimmed;
};

const normalizeNumber = (val) => {
  if (val === "" || val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
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

  return `---- ${first} ${last} || ${timestamp} ----\n\n${rawNote || ""}`;
};

/*
========================================
GET CLIENT ROSTER
========================================
*/
router.get("/client-roster", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t1.*
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster t1
      INNER JOIN (
        SELECT ACCOUNT, LOB, TASK, MAX(ID) AS max_id
        FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
        GROUP BY ACCOUNT, LOB, TASK
      ) t2
      ON t1.ID = t2.max_id
      ORDER BY t1.ACCOUNT ASC
    `);

    // ✅ Parse attachments JSON (KEEP THIS — already good)
    const formatted = rows.map((row) => ({
      ...row,
      ATTACHMENTS: (() => {
        try {
          if (!row.ATTACHMENTS) return [];
          if (typeof row.ATTACHMENTS === "object") return row.ATTACHMENTS;
          return JSON.parse(row.ATTACHMENTS);
        } catch (e) {
          console.warn("Invalid JSON in ATTACHMENTS:", row.ATTACHMENTS);
          return [];
        }
      })(),
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("Roster error:", err);
    res.status(500).json({ error: "Failed to load client roster" });
  }
});

/*
========================================
INSERT CLIENT + ATTACHMENTS
========================================
*/
router.post(
  "/client-roster",
  upload.array("attachments"),
  async (req, res) => {
    try {
      const data = req.body;
      const files = req.files || [];

      /*
      ========================================
      UPLOAD FILES TO S3
      ========================================
      */
      const uploadedFiles = [];

      for (const file of files) {
        const key = `clientRecordsAttachmentFolder/${Date.now()}_${file.originalname}`;

        const uploadParams = {
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        };

        const s3Res = await s3.upload(uploadParams).promise();

        uploadedFiles.push({
          name: file.originalname, // ✅ DISPLAY NAME
          url: s3Res.Location,     // ✅ ACTUAL FILE LINK
        });
      }

      /*
      ========================================
      FORMAT DATA
      ========================================
      */
      const formattedNotes = formatNoteEntry(
        data.userFirstName,
        data.userLastName,
        data.notes
      );

      const specialInstructions = data.specialInstructions || null;

      /*
      ========================================
      ATTACHMENT MERGE LOGIC (FIXED)
      ========================================
      */

      // 🔹 Get previous attachments from frontend
      let previousAttachments = [];

      try {
        previousAttachments = data.attachments
          ? typeof data.attachments === "string"
            ? JSON.parse(data.attachments)
            : data.attachments
          : [];
      } catch {
        previousAttachments = [];
      }

      // 🔹 ALWAYS carry over + append new uploads
      const finalAttachments = [
        ...previousAttachments,
        ...uploadedFiles,
      ];

      // 🔹 Optional: remove duplicates (by URL)
      const uniqueAttachments = finalAttachments.filter(
        (file, index, self) =>
          index === self.findIndex((f) => f.url === file.url)
      );

      // 🔹 Convert to JSON for DB
      const attachmentsJson = JSON.stringify(uniqueAttachments);

      /*
      ========================================
      INSERT
      ========================================
      */
      const values = [
        normalizeDate(data.effectiveDate),
        data.accountCode,
        data.qbAccount,
        data.account,
        data.lob,
        data.task,
        normalizeDate(data.msaDate),
        normalizeDate(data.liveDate),
        data.site,
        data.workSetup,
        data.staffingModel,
        normalizeNumber(data.drfte),
        normalizeNumber(data.phfte),
        normalizeNumber(data.dailyWorkHrs),
        normalizeNumber(data.holidayHrs),
        normalizeNumber(data.regularRate),
        normalizeNumber(data.premiumRate),
        normalizeNumber(data.depositFee),
        data.depositFeeWaived,
        normalizeNumber(data.setupFee),
        data.setupFeeWaived,
        normalizeNumber(data.extraMonitorFeePerUnit),
        normalizeNumber(data.extraMonitorQty),
        normalizeNumber(data.phoneLineFeePerFTEPerMonth),
        data.billingCycle,
        data.status,
        data.busAddress,
        data.state,
        data.contact1,
        data.contactNo1,
        data.contact2,
        data.contactNo2,
        data.salesperson,
        formattedNotes,
        specialInstructions, // ✅ NEW
        attachmentsJson,     // ✅ NEW
        normalizeDate(data.termDate),
      ];

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

      res.json({
        success: true,
        id: result.insertId,
        attachments: uniqueAttachments,
      });

    } catch (err) {
      console.error("Insert error:", err);
      res.status(500).json({ error: "Insert failed" });
    }
  }
);

/*
========================================
UPDATE NOTES
========================================
*/
router.put("/client-roster/:id/notes", async (req, res) => {
  try {
    const { id } = req.params;
    const { note, userFirstName, userLastName } = req.body;

    const newBlock = formatNoteEntry(userFirstName, userLastName, note);

    const [rows] = await db.execute(
      `SELECT NOTES FROM 1000_cmx_appdata_client_database.db_cmx_client_roster WHERE ID = ?`,
      [id]
    );

    const existing = rows[0]?.NOTES || "";
    const updated = existing ? `${existing}\n\n${newBlock}` : newBlock;

    await db.execute(
      `UPDATE 1000_cmx_appdata_client_database.db_cmx_client_roster SET NOTES = ? WHERE ID = ?`,
      [updated, id]
    );

    res.json({ success: true, notes: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

/*
========================================
ACCOUNT DETAILS
========================================
*/
router.get("/accountDetails", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
      WHERE STATUS = 'Active'
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

/*
========================================
CLIENTS
========================================
*/
router.get("/clients", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT DISTINCT ACCOUNT
      FROM 1000_cmx_appdata_client_database.db_cmx_client_roster
      WHERE STATUS = 'Active'
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error fetching clients" });
  }
});

module.exports = router;