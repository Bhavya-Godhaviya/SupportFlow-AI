
import { Worker } from "bullmq";
import redis from "../config/redis.js";
import sendEmail from "../utils/sendEmail.js";

console.log("Starting SupportFlow email worker...");

const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    console.log(`Processing email job: ${job.id}`);
    // Safe test mode: do not send a real email
    if (job.name === "test-job") {
        console.log("Test job received successfully!");
        console.log("Job data:", job.data);

        return { success: true, testMode: true };
    }
    // Add this new condition
    if (job.name === "test-failure") {
        console.log("Simulating email failure...");
        throw new Error("Simulated failure for retry testing");
    }

    const { to, subject, html } = job.data;
    await sendEmail({ to, subject, html });
    console.log(`Email job ${job.id} completed successfully`);
    return { success: true };
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

emailWorker.on("ready", () => {
  console.log("Email worker is ready and waiting for jobs");
});

emailWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

emailWorker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

emailWorker.on("error", (error) => {
  console.error("Email worker error:", error.message);
});

const gracefulShutdown = async () => {
    console.log("Shutting down email worker...");
  
    await emailWorker.close();
    await redis.quit();
  
    console.log("Email worker stopped successfully");
    process.exit(0);
};
  
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

export default emailWorker;
