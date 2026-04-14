const express = require("express");
const router = express.Router();
const db = require("../config/dbconfig");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

// ===============================
// 📧 EMAIL CONFIG (reuse env)
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
    rejectUnauthorized: false,
  },
});

// ===============================
// ✅ CHECK EMAIL
// ===============================
router.post("/check-email", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: "Email is required",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT user_email, user_last_name, user_first_name, user_full_name, user_access_level, user_status 
       FROM 0000_cmx_appdata_appusers.db_cmx_appusers_clientmanagement 
       WHERE user_email = ?`,
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "Email not registered",
      });
    }

    const user = rows[0];

    if (user.user_status !== "Active") {
      return res.status(403).json({
        success: false,
        error: "Inactive user",
      });
    }

    return res.json({
      success: true,
      user: {
        userid: user.user_email,
        userEmail: user.user_email,
        lastName: user.user_last_name,
        firstName: user.user_first_name,
        fullName: user.user_full_name,
        userLevel: user.user_access_level,
        userStatus: user.user_status,
      },
    });
  } catch (err) {
    console.error("Email check DB error:", err);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

// ===============================
// 🔐 SEND OTP
// ===============================
router.post("/sendOTP", async (req, res) => {
  try {
    const { emailAddress, requestedDateTime, expiryDateTime } = req.body;

    if (!emailAddress || !requestedDateTime || !expiryDateTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields.",
      });
    }

    const otpPlain = String(
      Math.floor(100000 + Math.random() * 900000)
    ).padStart(6, "0");

    const salt = await bcrypt.genSalt(10);
    const otpHashed = await bcrypt.hash(otpPlain, salt);

    await transporter.sendMail({
      from: "noreply@callmaxsolutions.com",
      to: emailAddress,
      subject: "One-Time Password (OTP)",
      html: `
        <p>Your OTP is:</p>
        <h2>${otpPlain}</h2>
        <p>This expires in 3 minutes.</p>
      `,
    });

    res.json({
      success: true,
      message: "OTP sent successfully.",
      otpHashed,
    });
  } catch (err) {
    console.error("OTP error:", err);
    res.status(500).json({
      success: false,
      message: "OTP failed",
    });
  }
});

module.exports = router;