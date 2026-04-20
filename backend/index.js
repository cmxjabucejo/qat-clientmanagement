

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
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

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
app.set("trust proxy", 1);
const PORT = process.env.SERVER_PORT || 5005;

/*
========================================
🔐 SECURITY
========================================
*/
app.use(helmet());

/*
========================================
🌐 CORS
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
🔥 BODY PARSER (CRITICAL FIX)
========================================
*/

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
🔥 START SERVER
========================================
*/
async function startServer() {
  try {
    await redisClient.connect();
    console.log("✅ Redis connected");

    /*
    ========================================
    🧠 SESSION
    ========================================
    */
    const redisStore = new SessionStore({
      client: redisClient,
      prefix: "cmx:",
    });

  app.use(
    session({
      name: process.env.SESSION_NAME,
      store: redisStore,
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",   // OK now (same domain)
        maxAge: 1000 * 60 * 60 * 8,
      },
    })
  );

    /*
    ========================================
    🔥 RATE LIMITERS
    ========================================
    */
    const otpLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: "otp:",
      }),
      windowMs: 10 * 60 * 1000, // 10 minutes
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `${req.body?.emailAddress || "noemail"}_${ipKeyGenerator(req.ip)}`,
    });

    const generalLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: "general:",
      }),
      windowMs: 5 * 60 * 1000,
      max: 150,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        req.session?.user?.id || ipKeyGenerator(req.ip),
    });

    const uploadLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: "upload:",
      }),
      windowMs: 5 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: "Too many save or upload attempts. Please try again in a few minutes.",
      },
      keyGenerator: (req) => {
        if (req.session?.user?.id) {
          return `user:${req.session.user.id}`;
        }
        return `ip:${ipKeyGenerator(req.ip)}`;
      },
    });

    /*
    ========================================
    📦 ROUTES
    ========================================
    */
    const authAPI = require("./services/authAPI");
    const clientRosterAPI = require("./services/clientRosterAPI");
    const clientEscalationAPI = require("./services/clientEscalationAPI");
    const clientSurveyAPI = require("./services/clientSurveyAPI");

    app.use("/api/sendOTP", otpLimiter);

    // 🚫 CRITICAL: skip limiter for multipart
    app.use("/api", (req, res, next) => {
      const contentType = req.headers["content-type"] || "";

      // 📦 If multipart (form + upload)
      if (contentType.startsWith("multipart/form-data")) {
        return uploadLimiter(req, res, next); // ✅ NOT bypass
      }

      // 🔐 Everything else
      return generalLimiter(req, res, next);
    });

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
    🚀 START
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

startServer();