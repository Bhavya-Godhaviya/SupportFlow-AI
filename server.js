import "dotenv/config";

import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";
import redis from "./config/redis.js";
import emailQueue from "./queues/email.queue.js";

const PORT = process.env.PORT || 5000;

let server;
let isShuttingDown = false;
const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    console.log("Shutdown already in progress...");
    return;
  }
  
  isShuttingDown = true;
  console.log(`${signal} received. Starting graceful shutdown...`);

  try {
    // Close HTTP server if it is still running
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log("HTTP server closed");
    } else {
      console.log("HTTP server is already closed");
    }

    // Close BullMQ queue
    await emailQueue.close();
    console.log("Email queue closed");

    // Disconnect MongoDB
    await mongoose.disconnect();
    console.log("MongoDB disconnected");

    // Close Redis
    if (redis.status !== "end") {
      await redis.quit();
    }
    console.log("Redis disconnected");

    console.log("Graceful shutdown completed");
    process.exit(0);

  } catch (error) {
    console.error("Graceful shutdown failed:", error.message);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer();