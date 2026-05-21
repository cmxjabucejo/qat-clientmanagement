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
🔐 REQUIRED ENV GUARD
========================================
*/
const requiredEnv = [
  "NODE_ENV",
  "SESSION_SECRET",
  "SESSION_NAME",

  "MYSQL_HOST",
  "MYSQL_USER",
  "MYSQL_PASSWORD",

  "REDIS_HOST",
  "REDIS_PORT",

  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "S3_BUCKET",

  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_USER",
  "EMAIL_PASS",

  "PROD_FRONTEND_URL",
  "QAT_FRONTEND_URL",
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingEnv.forEach((key) => console.error(`- ${key}`));
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  if (process.env.SESSION_SECRET.length < 32) {
    console.error("❌ SESSION_SECRET must be at least 32 characters in production.");
    process.exit(1);
  }

  if (
    process.env.PROD_FRONTEND_URL.includes("localhost") ||
    process.env.QAT_FRONTEND_URL.includes("localhost")
  ) {
    console.error("❌ Production/QAT frontend URLs must not use localhost.");
    process.exit(1);
  }
}

/*
========================================
🌐 ENV / ORIGIN CONFIG
========================================
*/
const isProduction = process.env.NODE_ENV === "production";

const DEV_FRONTEND_URL = process.env.DEV_FRONTEND_URL;
const DEV_BACKEND_URL = process.env.DEV_BACKEND_URL;
const PROD_FRONTEND_URL = process.env.PROD_FRONTEND_URL;
const QAT_FRONTEND_URL = process.env.QAT_FRONTEND_URL;

const allowedOrigins = [
  PROD_FRONTEND_URL,
  QAT_FRONTEND_URL,

  // Local dev only when not production
  !isProduction ? DEV_FRONTEND_URL : null,
].filter(Boolean);

const allowedConnectSrc = [
  "'self'",
  PROD_FRONTEND_URL,
  QAT_FRONTEND_URL,

  // Local dev only when not production
  !isProduction ? DEV_FRONTEND_URL : null,
  !isProduction ? DEV_BACKEND_URL : null,
].filter(Boolean);

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
🔐 SECURITY HEADERS
========================================
*/
app.use(
  helmet({
    frameguard: {
      action: "deny",
    },
    noSniff: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
        connectSrc: allowedConnectSrc,
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],

        // Only force upgrade in QAT/PROD.
        // This avoids localhost http issues during development.
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

/*
========================================
🔐 MANUAL SECURITY HEADERS
========================================
*/
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  next();
});

/*
========================================
🌐 CORS
========================================
*/
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow curl, Postman, health checks, server-to-server,
      // and same-origin requests with no Origin header.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/*
========================================
🔥 BODY PARSER
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
        name: process.env.SESSION_NAME || "cmx_cms_session",
        store: redisStore,
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
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
      windowMs: 10 * 60 * 1000,
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
        error:
          "Too many save or upload attempts. Please try again in a few minutes.",
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

    app.use("/api", (req, res, next) => {
      const contentType = req.headers["content-type"] || "";

      // 📦 Multipart upload routes
      if (contentType.startsWith("multipart/form-data")) {
        return uploadLimiter(req, res, next);
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