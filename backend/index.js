

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
app.set("trust proxy", 1);
const PORT = process.env.SERVER_PORT || 5005;

/*
========================================
🔧 TRUST PROXY
========================================
*/
app.set("trust proxy", 1);

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
      }),
      windowMs: 60 * 1000,
      max: 50,
      keyGenerator: (req) => rateLimit.ipKeyGenerator(req),
    });

    const generalLimiter = rateLimit({
      store: new RateLimitRedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
      }),
      windowMs: 15 * 60 * 1000,
      max: 300,
      keyGenerator: (req) =>
        req.session?.user?.id || rateLimit.ipKeyGenerator(req),
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

      // 🚫 completely skip BOTH limiter AND json parsing path
      if (contentType.startsWith("multipart/form-data")) {
        return next();
      }

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