const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// ===============================
// ⚙️ CONFIG
// ===============================
const OTP_EXPIRY_MINUTES = 3;
const MAX_VERIFY_ATTEMPTS = 5;
const GENERIC_AUTH_MESSAGE = "Invalid credentials or authentication request";

// ===============================
// 📧 EMAIL CONFIG
// ===============================
const transporter = nodemailer.createTransport({
  host: "email-smtp.us-east-1.amazonaws.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    // Keep false only for local/dev if needed.
    // For production, better to remove this or set true.
    rejectUnauthorized: process.env.NODE_ENV === "production",
  },
});

// ===============================
// 🧠 HELPERS
// ===============================
function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return forwarded ? forwarded.split(",")[0].trim() : req.ip;
}

function getUserAgent(req) {
  return req.headers["user-agent"] || null;
}

function generateFingerprint(req) {
  const ip = getClientIp(req);
  const ua = getUserAgent(req) || "";
  const deviceId = req.headers["x-device-id"] || "unknown";

  const raw = `${ip}|${ua}|${deviceId}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function writeAuditLog({
  email = null,
  eventType = null,
  status = null,
  ipAddress = null,
  userAgent = null,
  details = null,
}) {
  try {
    await db.execute(
      `INSERT INTO 0002_cmx_authhandler_cms.auth_audit_log_cms
       (email, event_type, status, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        email ?? null,
        eventType ?? null,
        status ?? null,
        ipAddress ?? null,
        userAgent ?? null,
        details ?? null,
      ],
    );
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

function buildUser(user) {
  return {
    userid: user.user_email,
    userEmail: user.user_email,
    firstName: user.user_first_name,
    lastName: user.user_last_name,
    fullName: user.user_full_name,
    userLevel: user.user_access_level,
    userStatus: user.user_status,
  };
}

async function sendNewDeviceAlert({ toEmail, name, ip, userAgent }) {
  const now = new Date().toLocaleString();

  const html = `
    <p>Hi ${name || "User"},</p>

    <p>We detected a login to your account from a <strong>new device</strong>.</p>

    <p><strong>Details:</strong></p>
    <ul>
      <li><strong>IP Address:</strong> ${ip}</li>
      <li><strong>Device/Browser:</strong> ${userAgent}</li>
      <li><strong>Time:</strong> ${now}</li>
    </ul>

    <p>If this was <strong>NOT you</strong>, please report to dream-devops@callmaxsolutions.com or notify the Callmax IT department.</p>

    <br/>
    <p>— Callmax DREAM-DEVOPS Team</p>
  `;

  await transporter.sendMail({
    to: toEmail,
    from: "Callmax Solutions - Security Alert <noreply@callmaxsolutions.com>",
    subject: "⚠️ New Login Detected",
    html,
  });
}

// ===============================
// ✅ CHECK EMAIL - ANTI USER ENUMERATION
// ===============================
router.post("/check-email", async (req, res) => {
  const email = normalizeEmail(req.body?.email || req.body?.emailAddress);
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  try {
    if (!email) {
      await writeAuditLog({
        email: null,
        eventType: "CHECK_EMAIL",
        status: "DENIED",
        ipAddress: ip,
        userAgent: ua,
        details: GENERIC_AUTH_MESSAGE,
      });

      return res.status(200).json({
        success: true,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    const [rows] = await db.execute(
      `SELECT user_email, user_status
       FROM 0000_cmx_appdata_appusers.db_cmx_appusers_clientmanagement
       WHERE user_email = ?`,
      [email],
    );

    const isAllowed = rows.length > 0 && rows[0].user_status === "Active";

    await writeAuditLog({
      email,
      eventType: "CHECK_EMAIL",
      status: isAllowed ? "SUCCESS" : "DENIED",
      ipAddress: ip,
      userAgent: ua,
      details: isAllowed
        ? "Authentication request accepted"
        : GENERIC_AUTH_MESSAGE,
    });

    return res.status(200).json({
      success: true,
      message: GENERIC_AUTH_MESSAGE,
    });
  } catch (err) {
    console.error("CHECK EMAIL ERROR:", err);

    await writeAuditLog({
      email: email || null,
      eventType: "CHECK_EMAIL",
      status: "ERROR",
      ipAddress: ip,
      userAgent: ua,
      details: err.message,
    });

    return res.status(200).json({
      success: true,
      message: GENERIC_AUTH_MESSAGE,
    });
  }
});

// ===============================
// 🔐 SEND OTP - ANTI USER ENUMERATION
// ===============================
router.post("/sendOTP", async (req, res) => {
  const emailAddress = normalizeEmail(
    req.body?.emailAddress || req.body?.email,
  );
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  try {
    if (!emailAddress) {
      await writeAuditLog({
        email: null,
        eventType: "SEND_OTP",
        status: "DENIED",
        ipAddress: ip,
        userAgent: ua,
        details: GENERIC_AUTH_MESSAGE,
      });

      return res.status(200).json({
        success: true,
        message: GENERIC_AUTH_MESSAGE,
        challengeId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000),
      });
    }

    const [userRows] = await db.execute(
      `SELECT user_email, user_first_name, user_status
       FROM 0000_cmx_appdata_appusers.db_cmx_appusers_clientmanagement
       WHERE user_email = ?`,
      [emailAddress],
    );

    if (!userRows.length || userRows[0].user_status !== "Active") {
      const fakeChallengeId = crypto.randomUUID();
      const fakeExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

      await writeAuditLog({
        email: emailAddress,
        eventType: "SEND_OTP",
        status: "DENIED",
        ipAddress: ip,
        userAgent: ua,
        details: GENERIC_AUTH_MESSAGE,
      });

      return res.status(200).json({
        success: true,
        message: GENERIC_AUTH_MESSAGE,
        challengeId: fakeChallengeId,
        expiresAt: fakeExpires,
      });
    }

    const user = userRows[0];
    const firstName = user.user_first_name || "User";

    // Expire old pending OTPs
    await db.execute(
      `UPDATE 0002_cmx_authhandler_cms.auth_otp_challenges_cms
       SET status = 'expired'
       WHERE email = ? AND status = 'pending'`,
      [emailAddress],
    );

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await bcrypt.hash(otp, 10);
    const challengeId = crypto.randomUUID();
    const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

    // Save OTP challenge
    await db.execute(
      `INSERT INTO 0002_cmx_authhandler_cms.auth_otp_challenges_cms
       (challenge_id, email, otp_hash, max_attempts, requested_ip, requested_user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        challengeId,
        emailAddress,
        hash,
        MAX_VERIFY_ATTEMPTS,
        ip ?? null,
        ua ?? null,
        expires,
      ],
    );

    // Send OTP email
    await transporter.sendMail({
      to: emailAddress,
      from: "Callmax Solutions <noreply@callmaxsolutions.com>",
      subject: "Your One-Time Password (OTP)",
      html: `
      <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;">
        <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden;">
          <div style="background:#0f4c5c; color:#ffffff; padding:14px; text-align:center; font-weight:bold;">
            Callmax Client Management Suite
          </div>

          <div style="padding:25px; text-align:center; color:#333;">
            <p style="text-align:left;">Hi ${firstName},</p>

            <p>Use the code below to complete your sign-in:</p>

            <div style="font-size:32px; letter-spacing:6px; font-weight:bold; margin:20px 0; color:#000;">
              ${otp}
            </div>

            <p style="font-size:14px; color:#555;">
              This code will expire in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
            </p>

            <p style="font-size:13px; color:#777; margin-top:15px;">
              If you did not request this code and suspect invalid use, report instance to:
            </p>

            <p style="font-size:13px; margin-top:5px;">
              <a href="mailto:dream-devops@callmaxsolutions.com" style="color:#0f4c5c; text-decoration:none;">
                dream-devops@callmaxsolutions.com
              </a>
            </p>
          </div>

          <div style="padding:18px; background:#fafafa; font-size:12px; color:#555; text-align:center;">
            <p style="margin-bottom:8px;">
              Unauthorized use of this system is subject to applicable cybersecurity laws.
            </p>

            <hr style="border:none; border-top:1px solid #ddd; margin:12px 0;" />

            <p style="margin:4px 0;">
              <strong>Powered by Callmax DREAM-DevOps</strong>
            </p>
            <p style="margin:4px 0;">
              Callmax Solutions International Inc
            </p>
            <p style="margin:4px 0;">
              <a href="https://www.callmaxsolutions.com" target="_blank" style="color:#0f4c5c;">
                www.callmaxsolutions.com
              </a>
            </p>
          </div>
        </div>
      </div>
      `,
    });

    await writeAuditLog({
      email: emailAddress,
      eventType: "SEND_OTP",
      status: "SUCCESS",
      ipAddress: ip,
      userAgent: ua,
      details: "OTP sent",
    });

    return res.status(200).json({
      success: true,
      message: GENERIC_AUTH_MESSAGE,
      challengeId,
      expiresAt: expires,
    });
  } catch (err) {
    console.error("SEND OTP ERROR:", err);

    await writeAuditLog({
      email: emailAddress || null,
      eventType: "SEND_OTP",
      status: "ERROR",
      ipAddress: ip,
      userAgent: ua,
      details: err.message,
    });

    return res.status(200).json({
      success: true,
      message: GENERIC_AUTH_MESSAGE,
    });
  }
});

// ===============================
// 🔓 VERIFY OTP
// ===============================
router.post("/verifyOTP", async (req, res) => {
  const { challengeId, otp } = req.body;
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  try {
    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    const [rows] = await db.execute(
      `SELECT *
       FROM 0002_cmx_authhandler_cms.auth_otp_challenges_cms
       WHERE challenge_id = ?`,
      [challengeId],
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    const c = rows[0];

    if (c.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    if (new Date() > new Date(c.expires_at)) {
      await db.execute(
        `UPDATE 0002_cmx_authhandler_cms.auth_otp_challenges_cms
         SET status = 'expired'
         WHERE challenge_id = ?`,
        [challengeId],
      );

      await writeAuditLog({
        email: c.email,
        eventType: "VERIFY_OTP",
        status: "EXPIRED",
        ipAddress: ip,
        userAgent: ua,
        details: "OTP expired",
      });

      return res.status(400).json({
        success: false,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    if (c.attempt_count >= c.max_attempts) {
      await writeAuditLog({
        email: c.email,
        eventType: "VERIFY_OTP",
        status: "LOCKED",
        ipAddress: ip,
        userAgent: ua,
        details: "Maximum attempts reached",
      });

      return res.status(429).json({
        success: false,
        message: "Too many invalid attempts. Please request a new OTP.",
      });
    }

    const match = await bcrypt.compare(String(otp).trim(), c.otp_hash);

    if (!match) {
      const newCount = Number(c.attempt_count || 0) + 1;
      const newStatus = newCount >= c.max_attempts ? "locked" : "pending";

      await db.execute(
        `UPDATE 0002_cmx_authhandler_cms.auth_otp_challenges_cms
         SET attempt_count = ?, status = ?
         WHERE challenge_id = ?`,
        [newCount, newStatus, challengeId],
      );

      await writeAuditLog({
        email: c.email,
        eventType: "VERIFY_OTP",
        status: "FAILED",
        ipAddress: ip,
        userAgent: ua,
        details: `Invalid OTP attempt ${newCount}`,
      });

      return res.status(401).json({
        success: false,
        message:
          newCount >= c.max_attempts
            ? "Too many invalid attempts. Please request a new OTP."
            : GENERIC_AUTH_MESSAGE,
      });
    }

    await db.execute(
      `UPDATE 0002_cmx_authhandler_cms.auth_otp_challenges_cms
       SET status = 'verified',
           verified_ip = ?,
           verified_user_agent = ?,
           verified_at = NOW()
       WHERE challenge_id = ?`,
      [ip ?? null, ua ?? null, challengeId],
    );

    const [userRows] = await db.execute(
      `SELECT *
       FROM 0000_cmx_appdata_appusers.db_cmx_appusers_clientmanagement
       WHERE user_email = ?`,
      [c.email],
    );

    if (!userRows.length || userRows[0].user_status !== "Active") {
      await writeAuditLog({
        email: c.email,
        eventType: "VERIFY_OTP",
        status: "DENIED",
        ipAddress: ip,
        userAgent: ua,
        details: GENERIC_AUTH_MESSAGE,
      });

      return res.status(403).json({
        success: false,
        message: GENERIC_AUTH_MESSAGE,
      });
    }

    const sessionUser = buildUser(userRows[0]);
    const fingerprint = generateFingerprint(req);

    const [devices] = await db.execute(
      `SELECT id, ip_address
       FROM 0002_cmx_authhandler_cms.auth_user_devices
       WHERE user_email = ? AND fingerprint = ?`,
      [c.email, fingerprint],
    );

    if (!devices.length) {
      await db.execute(
        `INSERT INTO 0002_cmx_authhandler_cms.auth_user_devices
         (user_email, fingerprint, ip_address, user_agent, is_trusted)
         VALUES (?, ?, ?, ?, ?)`,
        [c.email, fingerprint, ip ?? null, ua ?? null, false],
      );

      await writeAuditLog({
        email: c.email,
        eventType: "NEW_DEVICE",
        status: "WARNING",
        ipAddress: ip,
        userAgent: ua,
        details: "New device detected",
      });

      await sendNewDeviceAlert({
        toEmail: c.email,
        name: userRows[0].user_first_name,
        ip,
        userAgent: ua,
      });
    } else {
      await db.execute(
        `UPDATE 0002_cmx_authhandler_cms.auth_user_devices
         SET last_used = NOW(),
             ip_address = ?,
             user_agent = ?
         WHERE id = ?`,
        [ip ?? null, ua ?? null, devices[0].id],
      );
    }

    return req.session.regenerate((err) => {
      if (err) {
        console.error("Session regenerate error:", err);

        return res.status(500).json({
          success: false,
          message: "Session error",
        });
      }

      req.session.user = sessionUser;
      req.session.authenticated = true;

      req.session.save(async (err) => {
        if (err) {
          console.error("Session save error:", err);

          await writeAuditLog({
            email: c.email,
            eventType: "VERIFY_OTP",
            status: "ERROR",
            ipAddress: ip,
            userAgent: ua,
            details: "Session save failed",
          });

          return res.status(500).json({
            success: false,
            message: "Session could not be saved",
          });
        }

        await writeAuditLog({
          email: c.email,
          eventType: "VERIFY_OTP",
          status: "SUCCESS",
          ipAddress: ip,
          userAgent: ua,
          details: "OTP verified and session created",
        });

        return res.json({
          success: true,
          user: sessionUser,
        });
      });
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);

    await writeAuditLog({
      email: null,
      eventType: "VERIFY_OTP",
      status: "ERROR",
      ipAddress: ip,
      userAgent: ua,
      details: err.message,
    });

    return res.status(500).json({
      success: false,
      message: GENERIC_AUTH_MESSAGE,
    });
  }
});

// ===============================
// 📦 SESSION
// ===============================
router.get("/session", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "No active session",
    });
  }

  return res.json({
    success: true,
    user: req.session.user,
  });
});

// ===============================
// 🔓 LOGOUT
// ===============================
router.post("/logout", (req, res) => {
  const email = req.session?.user?.userEmail || null;
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  req.session.destroy(async (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Logout failed",
      });
    }

    res.clearCookie(process.env.SESSION_NAME || "cmx_cms_session");

    await writeAuditLog({
      email,
      eventType: "LOGOUT",
      status: "SUCCESS",
      ipAddress: ip,
      userAgent: ua,
      details: "User logged out",
    });

    return res.json({
      success: true,
      message: "Logged out successfully",
    });
  });
});

module.exports = router;
