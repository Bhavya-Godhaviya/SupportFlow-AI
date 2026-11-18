import express from "express";
import cors from "cors";
import helmet from "helmet";

import healthRoutes from "./routes/health.routes.js";
import ticketRoutes from "./routes/ticket.routes.js";
import authRoutes from "./routes/auth.routes.js";

import { apiLimiter } from "./middleware/rateLimit.middleware.js";
import errorMiddleware from "./middleware/error.middleware.js";

import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";

import auditRoutes from "./routes/audit.routes.js";

import "dotenv/config";

const app = express();
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),

        // Don't force HTTPS in local development
        "upgrade-insecure-requests": isProduction ? [] : null,
      },
    },

    // Enable HSTS only in production
    ...(isProduction ? {} : { strictTransportSecurity: false }),
  })
);

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",")
  : [];

app.use(
  cors({
    origin: isProduction ? allowedOrigins : true,
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// Global API rate limiter
app.use("/api", apiLimiter);

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/audit-logs", auditRoutes);

if (!isProduction) {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
  );
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Centralized error handler
app.use(errorMiddleware);

export default app;