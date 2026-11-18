import "dotenv/config";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import User from "../models/user.model.js";
import app from "../app.js";
import connectDB from "../config/db.js";
import Ticket from "../models/ticket.model.js";
import Comment from "../models/comment.model.js";
import emailQueue from "../queues/email.queue.js";

vi.mock("../queues/email.queue.js", () => ({
  default: {
    add: vi.fn().mockResolvedValue({
      id: "test-job-id",
    }),
  },
}));

let testUserId;
let token;
let testUser;

// Reusable authenticated request helper
const authRequest = (method, url) => {
  return request(app)
    [method](url)
    .set("Authorization", `Bearer ${token}`);
};

beforeAll(async () => {
  if (!process.env.MONGO_URI_TEST) {
    throw new Error("MONGO_URI_TEST is missing from .env");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from .env");
  }

  await connectDB(process.env.MONGO_URI_TEST);

  console.log("Test database:", mongoose.connection.name);
}, 30000);

beforeEach(async () => {
  vi.clearAllMocks();

  await Ticket.deleteMany({});
  await Comment.deleteMany({});
  await User.deleteMany({});

  testUser = await User.create({
    name: "Test Admin",
    email: "admin@test.com",
    password: "test123",
    role: "admin",
  });

  testUserId = testUser._id;

  token = jwt.sign(
    {
      userId: testUser._id.toString(),
      role: "admin",
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe("SupportFlow AI Ticket API", () => {

  it("should return an empty ticket list", async () => {
    const response = await authRequest(
      "get",
      "/api/tickets"
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("should create a ticket", async () => {
    const response = await authRequest(
      "post",
      "/api/tickets"
    ).send({
      title: "Login problem",
      description: "Unable to login",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe("Login problem");
    expect(emailQueue.add).toHaveBeenCalledWith(
      "ticket-confirmation",
      expect.objectContaining({
        subject: "Your support ticket has been created!",
      })
    );
  });

  it("should get a ticket by ID", async () => {
    const ticket = await Ticket.create({
      title: "Test ticket",
      description: "Test description",
      createdBy: testUserId,
    });

    const response = await authRequest(
      "get",
      `/api/tickets/${ticket._id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data._id).toBe(ticket.id);
  });

  it("should update a ticket using PATCH", async () => {
    const ticket = await Ticket.create({
      title: "Login issue",
      description: "Cannot login",
      createdBy: testUserId,
      assignedTo: testUserId,
    });

    const response = await authRequest(
      "patch",
      `/api/tickets/${ticket._id}`
    ).send({
      status: "in-progress",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("in-progress");
    expect(response.body.data.title).toBe("Login issue");
  });

  it("should replace ticket data using PUT", async () => {
    const ticket = await Ticket.create({
      title: "Old title",
      description: "Old description",
      createdBy: testUserId,
    });

    const response = await authRequest(
      "put",
      `/api/tickets/${ticket._id}`
    ).send({
      title: "New title",
      description: "New description",
      status: "open",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe("New title");
    expect(response.body.data.description).toBe("New description");
  });

  it("should delete a ticket", async () => {
    const ticket = await Ticket.create({
      title: "Delete me",
      description: "This ticket will be deleted",
      createdBy: testUserId,
    });

    const response = await authRequest(
      "delete",
      `/api/tickets/${ticket._id}`
    );

    expect(response.status).toBe(200);

    const deletedTicket = await Ticket.findById(ticket._id);

    expect(deletedTicket).toBeNull();
  });

  it("should filter tickets by status", async () => {
    await Ticket.create([
      {
        title: "Open ticket",
        description: "Open description",
        status: "open",
        createdBy: testUserId,
      },
      {
        title: "Closed ticket",
        description: "Closed description",
        status: "closed",
        createdBy: testUserId,
      },
    ]);

    const response = await authRequest(
      "get",
      "/api/tickets?status=open"
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe("open");
  });

  it("should support pagination", async () => {
    await Ticket.create(
      Array.from({ length: 12 }, (_, index) => ({
        title: `Ticket ${index + 1}`,
        description: `Description ${index + 1}`,
        createdBy: testUserId,
      }))
    );

    const response = await authRequest(
      "get",
      "/api/tickets?page=2&limit=5"
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.currentPage).toBe(2);
    expect(response.body.totalPages).toBe(3);
  });

  it("should return 404 for an unknown route", async () => {
    const response = await request(app)
      .get("/api/unknown-route");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it("should include Helmet security headers", async () => {
    const response = await request(app)
      .get("/api/health");

    expect(response.headers["x-content-type-options"])
      .toBe("nosniff");
  });

  it("should reject an invalid ticket ID", async () => {
    const response = await authRequest(
      "get",
      "/api/tickets/invalid-id"
    );

    expect(response.status).toBe(400);
  });

});
