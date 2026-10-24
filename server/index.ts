import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { log } from "./utils";
import { seedDatabase } from "./seed";
import { backgroundWorker } from "./worker";

const app = express();

// Trust proxy (nginx) - required for secure cookies behind reverse proxy
app.set('trust proxy', 1);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

app.use(express.json({
  limit: '50mb', // Allow larger payloads for base64 file uploads
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: false }));
app.use(cookieParser());

// Serve uploaded media files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use((req, res, next) => {
  const start = Date.now();
  // Redact capability tokens from the logged path (tokens are secrets).
  // Phase 4A-3a-2: chat tokens are capability secrets too — `/api/public/chat/
  // <token>/session` would otherwise write the plaintext token to the PM2 log on
  // every bootstrap. `{20,}` keeps the literal `/chat/session`, `/chat/messages`
  // etc. readable; a real token is 43 chars (32 bytes base64url).
  const path = req.path
    .replace(/\/share\/[A-Za-z0-9_-]+/, "/share/[redacted]")
    .replace(/\/chat\/[A-Za-z0-9_-]{20,}/, "/chat/[redacted]");
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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Seed database with initial data
  try {
    await seedDatabase();
  } catch (error) {
    log(`Seed database error (may be expected if data already exists): ${error}`);
  }

  registerRoutes(app);

  const server = (app as any).server;

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
     const __dirname = path.resolve();
    const clientDist = path.join(__dirname, "client-dist");
    app.use(express.static(clientDist));
    app.get("*", (_, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  const httpServer = server || app.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
    // Start background worker for job processing and daily balance deduction
    backgroundWorker.start();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('SIGTERM signal received: closing HTTP server');
    backgroundWorker.stop();
    httpServer.close(() => {
      log('HTTP server closed');
    });
  });
})();
