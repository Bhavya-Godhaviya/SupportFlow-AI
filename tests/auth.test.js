
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";

// Mock rate limiters so they don't interfere with controller tests.
vi.mock("../middleware/rateLimit.middleware.js", () => ({
  apiLimiter: (req, res, next) => next(),
  registerLimiter: (req, res, next) => next(),
  loginLimiter: (req, res, next) => next(),
}));

// Mock email service so tests never send real emails.
vi.mock("../queues/email.queue.js", () => ({
    default: {
      add: vi.fn().mockResolvedValue({
        id: "test-job-id",
      }),
    },
}));

import app from "../app.js";
import connectDB from "../config/db.js";
import User from "../models/user.model.js";
import emailQueue from "../queues/email.queue.js";

const BASE_URL = "/api/auth";

const testUserData = {
  name: "Test Customer",
  email: "customer@test.com",
  password: "Password123",
};

const createTestUser = async () => {
  const hashedPassword = await bcrypt.hash(
    testUserData.password,
    12
  );

  return User.create({
    name: testUserData.name,
    email: testUserData.email,
    password: hashedPassword,
    role: "customer",
  });
};

beforeAll(async () => {
  if (!process.env.MONGO_URI_TEST) {
    throw new Error("MONGO_URI_TEST is missing");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  await connectDB(process.env.MONGO_URI_TEST);
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();

  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.close();
});

// ======================================
// REGISTER TESTS
// ======================================

describe("POST /api/auth/register", () => {
  it("should register a user successfully", async () => {
    const response = await request(app)
      .post(`${BASE_URL}/register`)
      .send(testUserData);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe(
      "User registered successfully"
    );

    expect(response.body.user).toMatchObject({
      name: testUserData.name,
      email: testUserData.email,
      role: "customer",
    });

    expect(response.body.user.password).toBeUndefined();

    expect(emailQueue.add).toHaveBeenCalledOnce();

    expect(emailQueue.add).toHaveBeenCalledWith(
    "welcome-email",
    expect.objectContaining({
        to: testUserData.email,
        subject: "Welcome to SupportFlow AI!",
    })
    );

    const savedUser = await User.findOne({
      email: testUserData.email,
    }).select("+password");

    expect(savedUser).not.toBeNull();

    expect(savedUser.password).not.toBe(
      testUserData.password
    );

    expect(
      await bcrypt.compare(
        testUserData.password,
        savedUser.password
      )
    ).toBe(true);
  });

  it.each([
    {
      name: "missing name",
      body: {
        email: "customer@test.com",
        password: "Password123",
      },
    },
    {
      name: "missing email",
      body: {
        name: "Test Customer",
        password: "Password123",
      },
    },
    {
      name: "missing password",
      body: {
        name: "Test Customer",
        email: "customer@test.com",
      },
    },
  ])("should reject registration with $name", async ({ body }) => {
    const response = await request(app)
      .post(`${BASE_URL}/register`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "All fields are required"
    );
  });

  it("should reject passwords shorter than 8 characters", async () => {
    const response = await request(app)
      .post(`${BASE_URL}/register`)
      .send({
        ...testUserData,
        password: "1234567",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Password must be at least 8 characters"
    );
  });

  it("should reject an already registered email", async () => {
    await createTestUser();

    const response = await request(app)
      .post(`${BASE_URL}/register`)
      .send(testUserData);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "Email already registered"
    );
  });

  it("should handle duplicate key database errors", async () => {
    vi.spyOn(User, "create").mockRejectedValue({
      code: 11000,
    });

    const response = await request(app)
      .post(`${BASE_URL}/register`)
      .send(testUserData);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "Email already registered"
    );
  });

  it("should register successfully even if welcome email fails", async () => {
    emailQueue.add.mockRejectedValueOnce(
      new Error("Email service unavailable")
    );

    const response = await request(app)
      .post(`${BASE_URL}/register`)
      .send(testUserData);

    expect(response.status).toBe(201);

    const savedUser = await User.findOne({
      email: testUserData.email,
    });

    expect(savedUser).not.toBeNull();
  });

  it("should return 500 if database registration fails", async () => {
    vi.spyOn(User, "findOne").mockRejectedValue(
      new Error("Database unavailable")
    );

    const response = await request(app)
      .post(`${BASE_URL}/register`)
      .send(testUserData);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe(
      "Registration failed"
    );
  });
});

// ======================================
// LOGIN TESTS
// ======================================

describe("POST /api/auth/login", () => {
  it("should reject login when required fields are missing", async () => {
    const response = await request(app)
      .post(`${BASE_URL}/login`)
      .send({
        email: testUserData.email,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Email and password are required"
    );
  });

  it("should reject login if email does not exist", async () => {
    const response = await request(app)
      .post(`${BASE_URL}/login`)
      .send({
        email: "unknown@test.com",
        password: "Password123",
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Invalid email or password"
    );
  });

  it("should reject login with an incorrect password", async () => {
    await createTestUser();

    const response = await request(app)
      .post(`${BASE_URL}/login`)
      .send({
        email: testUserData.email,
        password: "WrongPassword123",
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Invalid email or password"
    );
  });

  it("should login successfully and return a valid JWT", async () => {
    const user = await createTestUser();

    const response = await request(app)
      .post(`${BASE_URL}/login`)
      .send({
        email: testUserData.email,
        password: testUserData.password,
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(
      "Login successful"
    );

    expect(response.body.token).toBeDefined();

    expect(response.body.user).toMatchObject({
      name: testUserData.name,
      email: testUserData.email,
      role: "customer",
    });

    expect(response.body.user.password).toBeUndefined();

    const decoded = jwt.verify(
      response.body.token,
      process.env.JWT_SECRET
    );

    expect(decoded.userId).toBe(user._id.toString());
    expect(decoded.role).toBe("customer");
  });

  it("should normalize email before login", async () => {
    await createTestUser();

    const response = await request(app)
      .post(`${BASE_URL}/login`)
      .send({
        email: "  CUSTOMER@TEST.COM  ",
        password: testUserData.password,
      });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
  });

  it("should return 500 if login database query fails", async () => {
    vi.spyOn(User, "findOne").mockReturnValue({
      select: vi.fn().mockRejectedValue(
        new Error("Database unavailable")
      ),
    });

    const response = await request(app)
      .post(`${BASE_URL}/login`)
      .send({
        email: testUserData.email,
        password: testUserData.password,
      });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Login failed");
  });
});
