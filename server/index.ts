import { loadPricingChartFromDb } from "./ai-pricing";
import { loadSystemSettingsFromDb } from "./system-settings";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { db } from "./db";
import { resolveGeminiApiKey } from "./gemini-env";
import { jobs } from "@shared/schema";
import { inArray } from "drizzle-orm";

const app = express();

// Security Middleware
app.set("trust proxy", 1); // Trust first proxy for rate limiting (important for GCP/Render)
app.use(helmet({
  contentSecurityPolicy: false, // Vite uses inline scripts in dev, and we might have external assets
}));
app.use(cors({
  origin: process.env.NODE_ENV === "production" ? (process.env.FRONTEND_URL || true) : "*",
  credentials: true,
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});
// Apply to all API routes
app.use("/api", limiter);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

function logMissingEnvVars() {
  const checks: Array<[string, string | undefined]> = [
    ["DATABASE_URL or SUPABASE_DATABASE_URL", process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL],
    ["SUPABASE_URL or VITE_SUPABASE_URL", process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["VITE_SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY],
    ["GEMINI_API_KEY (or AI_INTEGRATIONS_GEMINI_API_KEY)", resolveGeminiApiKey()],
  ];

  for (const [name, value] of checks) {
    if (!value) {
      console.error(`[startup] Missing env var: ${name}`);
    }
  }
}

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // if (capturedJsonResponse) {
      //   logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      // }

      log(logLine);
    }
  });

  next();
});

(async () => {
  logMissingEnvVars();

  try {
  // Clear stuck jobs
  try {
    await db.update(jobs)
      .set({ status: "failed", error: "Job interrupted by server restart" })
      .where(inArray(jobs.status, ["pending", "processing"]));
    console.log("Cleaned up stuck background jobs.");
  } catch (err) {
    console.error("Failed to clean up stuck jobs:", err);
  }


  // Load AI Pricing Chart
  await loadPricingChartFromDb();
  await loadSystemSettingsFromDb();

  await registerRoutes(httpServer, app);


  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === "production";

    // Only send generic message in production to prevent data leaks
    const message = isProduction && status >= 500
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

    console.error(`[Error] ${status}: ${err.message}`, isProduction ? "" : err.stack);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const server = httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  const gracefulShutdown = () => {
    log("Received shutdown signal, shutting down gracefully.");
    server.close(() => {
      log("Closed out remaining connections.");
      process.exit(0);
    });

    setTimeout(() => {
      log("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
  } catch (err) {
    console.error("Startup initialization failed:", err);
    process.exit(1);
  }
})();
