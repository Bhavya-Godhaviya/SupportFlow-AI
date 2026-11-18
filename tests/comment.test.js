import "dotenv/config";

import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";

import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";

import app from "../app.js";
import connectDB from "../config/db.js";

import Ticket from "../models/ticket.model.js";
import Comment from "../models/comment.model.js";

let customerId;
let otherCustomerId;
let agentId;
let otherAgentId;
let adminId;

let ticketId;
let otherTicketId;

let customerToken;
let otherCustomerToken;
let agentToken;
let otherAgentToken;
let adminToken;


const createToken = (userId, role) => {
  return jwt.sign(
    {
      userId: userId.toString(),
      role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
    }
  );
};

const authRequest = (method, url, token) => {
  return request(app)
    [method](url)
    .set("Authorization", `Bearer ${token}`);
};

beforeAll(async () => {
  if (!process.env.MONGO_URI_TEST) {
    throw new Error("MONGO_URI_TEST is missing");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  if (mongoose.connection.readyState === 0) {
    await connectDB(process.env.MONGO_URI_TEST);
  }
});

beforeEach(async () => {
    await Comment.deleteMany({});
    await Ticket.deleteMany({});  
    customerId = new mongoose.Types.ObjectId();
    otherCustomerId = new mongoose.Types.ObjectId();

    agentId = new mongoose.Types.ObjectId();
    otherAgentId = new mongoose.Types.ObjectId();

    adminId = new mongoose.Types.ObjectId();

    // Create test tickets
    const ticket = await Ticket.create({
        title: "Login problem",
        description: "Unable to login",
        createdBy: customerId,
        assignedTo: agentId,
    });

    const otherTicket = await Ticket.create({
        title: "Payment problem",
        description: "Payment failed",
        createdBy: otherCustomerId,
        assignedTo: otherAgentId,
    });

    ticketId = ticket._id.toString();
    otherTicketId = otherTicket._id.toString();


    // Generate JWT tokens
    customerToken = createToken(customerId, "customer");

    otherCustomerToken = createToken(
        otherCustomerId,
        "customer"
    );

    agentToken = createToken(agentId, "agent");

    otherAgentToken = createToken(
        otherAgentId,
        "agent"
    );

    adminToken = createToken(adminId, "admin");
    });

    describe("SupportFlow AI Comment API", () => {

    it("should allow customer to create a comment", async () => {
        const response = await authRequest(
        "post",
        `/api/tickets/${ticketId}/comments`,
        customerToken
        ).send({
        message: "I am facing a login problem",
        });

        expect(response.status).toBe(201);

        expect(response.body.success).toBe(true);

        expect(response.body.data.message).toBe(
        "I am facing a login problem"
    );
});

  it("should allow assigned agent to reply", async () => {
    const response = await authRequest(
      "post",
      `/api/tickets/${ticketId}/comments`,
      agentToken
    ).send({
      message: "We are investigating your issue",
    });

    expect(response.status).toBe(201);
  });

  it("should reject a different agent", async () => {
    const response = await authRequest(
      "post",
      `/api/tickets/${ticketId}/comments`,
      otherAgentToken
    ).send({
      message: "Unauthorized reply",
    });

    expect(response.status).toBe(403);
  });

  it("should reject another customer's access", async () => {
    const response = await authRequest(
      "get",
      `/api/tickets/${ticketId}/comments`,
      otherCustomerToken
    );

    expect(response.status).toBe(403);
  });

  it("should allow customer to retrieve comments", async () => {
    await Comment.create({
      ticket: ticketId,
      user: customerId,
      message: "My first comment",
    });

    const response = await authRequest(
      "get",
      `/api/tickets/${ticketId}/comments`,
      customerToken
    );

    expect(response.status).toBe(200);

    expect(response.body.data.length).toBe(1);

    expect(response.body.data[0].message).toBe(
      "My first comment"
    );
  });

  it("should allow admin to retrieve comments", async () => {
    const response = await authRequest(
      "get",
      `/api/tickets/${ticketId}/comments`,
      adminToken
    );

    expect(response.status).toBe(200);
  });

  it("should reject an empty comment", async () => {
    const response = await authRequest(
      "post",
      `/api/tickets/${ticketId}/comments`,
      customerToken
    ).send({
      message: "",
    });

    expect(response.status).toBe(400);
  });

  it("should reject comments exceeding 2000 characters", async () => {
    const response = await authRequest(
      "post",
      `/api/tickets/${ticketId}/comments`,
      customerToken
    ).send({
      message: "a".repeat(2001),
    });

    expect(response.status).toBe(400);
  });

  it("should reject requests without authentication", async () => {
    const response = await request(app).get(
      `/api/tickets/${ticketId}/comments`
    );

    expect(response.status).toBe(401);
  });

  it("should support pagination", async () => {
    await Comment.insertMany([
      {
        ticket: ticketId,
        user: customerId,
        message: "Comment 1",
      },
      {
        ticket: ticketId,
        user: agentId,
        message: "Comment 2",
      },
      {
        ticket: ticketId,
        user: customerId,
        message: "Comment 3",
      },
    ]);

    const response = await authRequest(
      "get",
      `/api/tickets/${ticketId}/comments?page=1&limit=2`,
      customerToken
    );

    expect(response.status).toBe(200);

    expect(response.body.data.length).toBe(2);

    expect(response.body.pagination.totalComments).toBe(3);

    expect(response.body.pagination.totalPages).toBe(2);

    expect(response.body.pagination.hasNextPage).toBe(true);
  });

  it("should reject an invalid ticket ID", async () => {
    const response = await authRequest(
      "get",
      "/api/tickets/invalid-id/comments",
      customerToken
    );

    expect(response.status).toBe(400);
  });

  it("should return 404 for a nonexistent ticket", async () => {
    const nonexistentId = new mongoose.Types.ObjectId();

    const response = await authRequest(
      "get",
      `/api/tickets/${nonexistentId}/comments`,
      customerToken
    );

    expect(response.status).toBe(404);
  });

});

afterAll(async () => {
  await mongoose.disconnect();
});