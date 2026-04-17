const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const AWS = require("aws-sdk");
const session = require("express-session");

// 🔴 REDIS
const { createClient } = require("redis");
const { RedisStore: SessionStore } = require("connect-redis");
const { RedisStore: RateLimitRedisStore } = require("rate-limit-redis");

// 🔐 SECURITY
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

dotenv.config();

/*
========================================
🔥 GLOBAL ERROR HANDLERS
========================================
*/
process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 UNHANDLED REJECTION:", err);
});

/*
========================================
🌐 AWS CONFIG
========================================
*/
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

/*
========================================
🚀 APP INIT
========================================
*/
const app = express();
const PORT = process.env.SERVER_PORT || 5005;

/*
========================================
🔧 TRUST PROXY
========================================
*/
app.set("trust proxy", 1);

/*
========================================
🔐 SECURITY MIDDLEWARE
========================================
*/
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

/*
========================================
🌐 CORS CONFIG
========================================
*/
app.use(
  cors({
    origin: [
      "https://cms.cmxph.com",
      "http://localhost:3000",
    ],
    credentials: true,
  })
);

/*
========================================
🔴 REDIS CLIENT
========================================
*/
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Error:", err);
});

/*
========================================
🔥 START SERVER (ASYNC SAFE INIT)
========================================
*/
async function startServer() {
  try {
    // ✅ Connect Redis FIRST
    await redisClient.connect();
    console.log("✅ Redis connected");

    /*
    ========================================
    🧠 SESSION STORE (REDIS)
    ========================================
    */
    const redisStore = new SessionStore({
      client: redisClient,
      prefix: "cmx:",
    });

    /*
    ========================================
    🔐 SESSION CONFIG
    ========================================
    */
    app.use(
      session({
        name: process.env.SESSION_NAME || "cmx_cms_session",
        secret: process.env.SESSION_SECRET || "super-secret-key",
        store: redisStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          secure: false,        // ✅ MUST be false in localhost
          sameSite: "lax",      // ✅ correct for localhost (NOT "none")
          maxAge: 1000 * 60 * 60 * 8,
          path: "/",
        }
      })
    );

    /*
    ========================================
    🔥 REDIS RATE LIMITER
    ========================================
    */

    // 🔴 OTP LIMITER (STRICT)
    const otpLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      }),
      windowMs: 60 * 1000, // 1 minute
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.ip,
      message: {
        success: false,
        message: "Too many OTP requests. Please wait.",
      },
    });

    // 🟢 GENERAL LIMITER
    const generalLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      }),
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.originalUrl.startsWith("/api/sendOTP"),
    });

    /*
    ========================================
    📦 IMPORT ROUTES
    ========================================
    */
    const authAPI = require("./services/authAPI");
    const clientRosterAPI = require("./services/clientRosterAPI");
    const clientEscalationAPI = require("./services/clientEscalationAPI");
    const clientSurveyAPI = require("./services/clientSurveyAPI");

    /*
    ========================================
    🚀 APPLY LIMITERS
    ========================================
    */
    app.use("/api/sendOTP", otpLimiter);
    app.use("/api", generalLimiter);

    /*
    ========================================
    🚀 ROUTES
    ========================================
    */
    app.use("/api", authAPI);
    app.use("/api", clientRosterAPI);
    app.use("/api", clientEscalationAPI);
    app.use("/api", clientSurveyAPI);

    /*
    ========================================
    ❤️ HEALTH CHECK
    ========================================
    */
    app.get("/", (req, res) => {
      res.send("CMX API running 🚀");
    });

    /*
    ========================================
    🚀 START SERVER
    ========================================
    */
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

/*
========================================
🚀 INIT
========================================
*/
startServer();