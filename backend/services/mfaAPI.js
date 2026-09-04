const express = require("express");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { generateSecret, generateURI, verify } = require("otplib");
const db = require("../config/dbconfig");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
const MFA_DATABASE = "0002_cmx_authhandler_cms";
const MFA_TABLE = `${MFA_DATABASE}.auth_user_mfa`;
const MFA_ISSUER = "Callmax Client Management Suite";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(process.env.SESSION_SECRET)
  .digest();

async function initializeMfaTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${MFA_TABLE} (
      user_email VARCHAR(255) NOT NULL PRIMARY KEY,
      secret_ciphertext TEXT NOT NULL,
      secret_iv VARCHAR(32) NOT NULL,
      secret_auth_tag VARCHAR(32) NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      preferred_method VARCHAR(24) NOT NULL DEFAULT 'otp',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    ENCRYPTION_KEY,
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

function decryptSecret(record) {
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(record.secret_iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(record.secret_auth_tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.secret_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function getUserEmail(req) {
  return String(req.session.user.userEmail || "")
    .trim()
    .toLowerCase();
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

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

async function createAuthenticatedSession(req, user) {
  const sessionUser = buildUser(user);

  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });

  req.session.user = sessionUser;
  req.session.authenticated = true;
  await saveSession(req);
  return sessionUser;
}

router.post("/mfa/login/start", async (req, res) => {
  const userEmail = String(req.body?.emailAddress || req.body?.email || "")
    .trim()
    .toLowerCase();

  try {
    const [rows] = await db.execute(
      `SELECT u.*, m.is_enabled
       FROM 0000_cmx_appdata_appusers.db_cmx_appusers_clientmanagement u
       LEFT JOIN ${MFA_TABLE} m ON m.user_email = u.user_email
       WHERE u.user_email = ? AND u.user_status = 'Active'`,
      [userEmail],
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials or authentication request",
      });
    }

    if (!rows[0].is_enabled) {
      return res.status(409).json({
        success: false,
        code: "MFA_NOT_CONFIGURED",
        message:
          "Microsoft Authenticator is not set up for this account. Choose Email OTP or set up Authenticator after signing in.",
      });
    }

    req.session.pendingMfaLogin = {
      email: userEmail,
      expiresAt: Date.now() + 3 * 60 * 1000,
      attempts: 0,
    };
    await saveSession(req);

    return res.json({
      success: true,
      expiresAt: req.session.pendingMfaLogin.expiresAt,
    });
  } catch (err) {
    console.error("MFA LOGIN START ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Invalid credentials or authentication request",
    });
  }
});

router.post("/mfa/login/verify", async (req, res) => {
  const pending = req.session?.pendingMfaLogin;
  const token = String(req.body?.token || "").replace(/\D/g, "");

  if (!pending || pending.expiresAt < Date.now() || token.length !== 6) {
    return res.status(400).json({
      success: false,
      message: "Invalid credentials or authentication request",
    });
  }

  if (pending.attempts >= 5) {
    return res.status(429).json({
      success: false,
      message: "Too many invalid attempts. Please start again.",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT u.*, m.secret_ciphertext, m.secret_iv, m.secret_auth_tag
       FROM 0000_cmx_appdata_appusers.db_cmx_appusers_clientmanagement u
       INNER JOIN ${MFA_TABLE} m ON m.user_email = u.user_email
       WHERE u.user_email = ? AND u.user_status = 'Active' AND m.is_enabled = TRUE`,
      [pending.email],
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials or authentication request",
      });
    }

    const secret = decryptSecret(rows[0]);
    const result = await verify({ token, secret });

    if (!result.valid) {
      pending.attempts += 1;
      await saveSession(req);
      return res.status(400).json({
        success: false,
        message: "Invalid credentials or authentication request",
      });
    }

    const user = await createAuthenticatedSession(req, rows[0]);
    return res.json({ success: true, user });
  } catch (err) {
    console.error("MFA LOGIN VERIFY ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Invalid credentials or authentication request",
    });
  }
});

router.get("/mfa/setup", requireAuth, async (req, res) => {
  const userEmail = getUserEmail(req);

  try {
    const secret = generateSecret();
    const provisioningUri = generateURI({
      issuer: MFA_ISSUER,
      label: userEmail,
      secret,
    });
    const qrCodeUrl = await QRCode.toDataURL(provisioningUri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    });
    const encrypted = encryptSecret(secret);

    await db.execute(
      `INSERT INTO ${MFA_TABLE}
       (user_email, secret_ciphertext, secret_iv, secret_auth_tag, is_enabled, preferred_method)
       VALUES (?, ?, ?, ?, FALSE, 'otp')
       ON DUPLICATE KEY UPDATE
         secret_ciphertext = VALUES(secret_ciphertext),
         secret_iv = VALUES(secret_iv),
         secret_auth_tag = VALUES(secret_auth_tag),
         is_enabled = FALSE,
         updated_at = CURRENT_TIMESTAMP`,
      [userEmail, encrypted.ciphertext, encrypted.iv, encrypted.authTag],
    );

    return res.json({
      success: true,
      qrCodeUrl,
      secret,
      expiresInSeconds: 600,
    });
  } catch (err) {
    console.error("MFA SETUP ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to start Authenticator setup.",
    });
  }
});

router.post("/mfa/verify", requireAuth, async (req, res) => {
  const userEmail = getUserEmail(req);
  const token = String(req.body?.token || "").replace(/\D/g, "");

  if (token.length !== 6) {
    return res
      .status(400)
      .json({ success: false, message: "Enter a valid six-digit code." });
  }

  try {
    const [rows] = await db.execute(
      `SELECT secret_ciphertext, secret_iv, secret_auth_tag FROM ${MFA_TABLE} WHERE user_email = ?`,
      [userEmail],
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "Start Authenticator setup before verifying the code.",
      });
    }

    const secret = decryptSecret(rows[0]);
    const result = await verify({ token, secret });

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        message: "That Authenticator code is not valid.",
      });
    }

    await db.execute(
      `UPDATE ${MFA_TABLE} SET is_enabled = TRUE, preferred_method = 'authenticator' WHERE user_email = ?`,
      [userEmail],
    );

    return res.json({
      success: true,
      message: "Microsoft Authenticator connected.",
    });
  } catch (err) {
    console.error("MFA VERIFY ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to verify Authenticator code.",
    });
  }
});

router.post("/mfa/preference", requireAuth, async (req, res) => {
  const userEmail = getUserEmail(req);
  const method = req.body?.method;

  if (!["otp", "authenticator"].includes(method)) {
    return res
      .status(400)
      .json({ success: false, message: "Unsupported sign-in method." });
  }

  try {
    const [rows] = await db.execute(
      `SELECT is_enabled FROM ${MFA_TABLE} WHERE user_email = ?`,
      [userEmail],
    );

    if (method === "authenticator" && (!rows.length || !rows[0].is_enabled)) {
      return res.status(400).json({
        success: false,
        message: "Verify Authenticator setup before selecting it.",
      });
    }

    await db.execute(
      `INSERT INTO ${MFA_TABLE} (user_email, secret_ciphertext, secret_iv, secret_auth_tag, is_enabled, preferred_method)
       VALUES (?, '', '', '', FALSE, ?)
       ON DUPLICATE KEY UPDATE preferred_method = VALUES(preferred_method)`,
      [userEmail, method],
    );

    return res.json({ success: true, preferredMethod: method });
  } catch (err) {
    console.error("MFA PREFERENCE ERROR:", err);
    return res
      .status(500)
      .json({ success: false, message: "Unable to save sign-in preference." });
  }
});

module.exports = { router, initializeMfaTable };
