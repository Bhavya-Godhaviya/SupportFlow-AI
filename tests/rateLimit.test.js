import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";

import {
  apiLimiter,
  loginLimiter,
  registerLimiter,
} from "../middleware/rateLimit.middleware.js";

describe("Rate Limiting Tests", () => {

  // Test 1: General API rate limit
  it("should block requests after 100 requests", async () => {
    const app = express();

    app.get("/api/test", apiLimiter, (req, res) => {
      res.status(200).json({ success: true });
    });

    // First 100 requests should succeed
    for (let i = 0; i < 100; i++) {
      const response = await request(app).get("/api/test");
      expect(response.status).toBe(200);
    }

    // 101st request should be blocked
    const response = await request(app).get("/api/test");

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Too many requests. Please try again later."
    );
  }, 15000);


  // Test 2: Login rate limit
  it("should block login after 5 failed attempts", async () => {
    const app = express();

    app.post("/login", loginLimiter, (req, res) => {
      const successful = req.query.success === "true";

      if (successful) {
        return res.status(200).json({ success: true });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    });

    // Successful login attempts should not count
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/login?success=true");

      expect(response.status).toBe(200);
    }

    // First 5 failed attempts should return 401
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post("/login");

      expect(response.status).toBe(401);
    }

    // 6th failed attempt should return 429
    const response = await request(app).post("/login");

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Too many login attempts. Please try again later."
    );
  }, 10000);


  // Test 3: Registration rate limit
  it("should block registration after 5 attempts", async () => {
    const app = express();

    app.post("/register", registerLimiter, (req, res) => {
      res.status(400).json({
        success: false,
        message: "Registration validation failed",
      });
    });

    // First 5 requests should be allowed through the limiter
    for (let i = 0; i < 5; i++) {
      const response = await request(app).post("/register");

      expect(response.status).toBe(400);
    }

    // 6th request should be blocked
    const response = await request(app).post("/register");

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Too many registration attempts. Please try again later."
    );
  }, 10000);

});