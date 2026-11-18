
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

import app from "../app.js";
import connectDB from "../config/db.js";

import User from "../models/user.model.js";
import Ticket from "../models/ticket.model.js";
import AuditLog from "../models/auditLog.model.js";

vi.mock("../queues/email.queue.js", () => ({
    default: {
      add: vi.fn().mockResolvedValue({
        id: "test-job-id",
      }),
    },
}));

// Test users
let customer;
let anotherCustomer;
let agent;
let anotherAgent;
let admin;

// Generate JWT for any test user
const getToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

// Reusable authenticated request helper
const authRequest = (method, url, user) => {
  return request(app)
    [method](url)
    .set("Authorization", `Bearer ${getToken(user)}`);
};

// Create a ticket directly in the test database
const createTestTicket = (overrides = {}) => {
  return Ticket.create({
    title: "Test ticket",
    description: "Test description",
    createdBy: customer._id,
    ...overrides,
  });
};

beforeAll(async () => {
  if (!process.env.MONGO_URI_TEST) {
    throw new Error("MONGO_URI_TEST is missing from .env");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from .env");
  }

  await connectDB(process.env.MONGO_URI_TEST);

  console.log("Audit test database:", mongoose.connection.name);
});

beforeEach(async () => {
  // Clear collections before every test
  await Ticket.deleteMany({});
  await AuditLog.deleteMany({});
  await User.deleteMany({});

  // Create fresh test users
  [
    customer,
    anotherCustomer,
    agent,
    anotherAgent,
    admin,
  ] = await User.create([
    {
      name: "Test Customer",
      email: "customer@test.com",
      password: "test123",
      role: "customer",
    },
    {
      name: "Another Customer",
      email: "customer2@test.com",
      password: "test123",
      role: "customer",
    },
    {
      name: "Test Agent",
      email: "agent@test.com",
      password: "test123",
      role: "agent",
    },
    {
      name: "Another Agent",
      email: "agent2@test.com",
      password: "test123",
      role: "agent",
    },
    {
      name: "Test Admin",
      email: "admin@test.com",
      password: "test123",
      role: "admin",
    },
  ]);
});

afterAll(async () => {
  await mongoose.connection.close();
});

describe("SupportFlow AI Audit Logging", () => {

  // TEST 1: Ticket creation audit
  it("should create an audit log when a ticket is created", async () => {
    const response = await authRequest(
      "post",
      "/api/tickets",
      customer
    ).send({
      title: "Login issue",
      description: "Unable to login",
    });

    expect(response.status).toBe(201);

    const ticketId = response.body.data._id;

    const auditLog = await AuditLog.findOne({
      entityId: ticketId,
      action: "TICKET_CREATED",
    });

    expect(auditLog).not.toBeNull();
    expect(String(auditLog.performedBy)).toBe(
      String(customer._id)
    );

    expect(auditLog.changes.title).toBe("Login issue");
    expect(auditLog.changes.status).toBe("open");
  });

  // TEST 2: Ticket update audit
  it("should record old and new values when a ticket is updated", async () => {
    const ticket = await createTestTicket({
      assignedTo: agent._id,
    });

    const response = await authRequest(
      "patch",
      `/api/tickets/${ticket._id}`,
      agent
    ).send({
      title: "Updated ticket title",
    });

    expect(response.status).toBe(200);

    const auditLog = await AuditLog.findOne({
      entityId: ticket._id,
      action: "TICKET_UPDATED",
    });

    expect(auditLog).not.toBeNull();

    expect(auditLog.changes.title).toEqual({
      from: "Test ticket",
      to: "Updated ticket title",
    });
  });

  // TEST 3: First assignment, reassignment and same-agent assignment
  it("should correctly audit ticket assignment and reassignment", async () => {
    const ticket = await createTestTicket();

    // First assignment
    let response = await authRequest(
      "patch",
      `/api/tickets/${ticket._id}/assign`,
      admin
    ).send({
      agentId: agent._id.toString(),
    });

    expect(response.status).toBe(200);

    let logs = await AuditLog.find({
      entityId: ticket._id,
      action: "TICKET_ASSIGNED",
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].changes.assignedTo.from).toBeNull();
    expect(logs[0].changes.assignedTo.to).toBe(
      agent._id.toString()
    );

    // Reassignment to another agent
    response = await authRequest(
      "patch",
      `/api/tickets/${ticket._id}/assign`,
      admin
    ).send({
      agentId: anotherAgent._id.toString(),
    });

    expect(response.status).toBe(200);

    logs = await AuditLog.find({
      entityId: ticket._id,
      action: "TICKET_ASSIGNED",
    }).sort({ createdAt: 1 });

    expect(logs).toHaveLength(2);
    expect(logs[1].changes.assignedTo.from).toBe(
      agent._id.toString()
    );
    expect(logs[1].changes.assignedTo.to).toBe(
      anotherAgent._id.toString()
    );

    // Assign the same agent again
    response = await authRequest(
      "patch",
      `/api/tickets/${ticket._id}/assign`,
      admin
    ).send({
      agentId: anotherAgent._id.toString(),
    });

    expect(response.status).toBe(200);

    logs = await AuditLog.find({
      entityId: ticket._id,
      action: "TICKET_ASSIGNED",
    });

    // No duplicate log should be created
    expect(logs).toHaveLength(2);
  });

  // TEST 4: Ticket deletion audit
  it("should preserve audit information when a ticket is deleted", async () => {
    const ticket = await createTestTicket({
      assignedTo: agent._id,
    });

    const response = await authRequest(
      "delete",
      `/api/tickets/${ticket._id}`,
      admin
    );

    expect(response.status).toBe(200);

    // Verify ticket is deleted
    const deletedTicket = await Ticket.findById(ticket._id);

    expect(deletedTicket).toBeNull();

    // Verify audit log still exists
    const auditLog = await AuditLog.findOne({
      entityId: ticket._id,
      action: "TICKET_DELETED",
    });

    expect(auditLog).not.toBeNull();
    expect(auditLog.changes.deletedTicket.title).toBe(
      "Test ticket"
    );
    expect(auditLog.changes.deletedTicket.assignedTo).toBe(
      agent._id.toString()
    );
  });

  // TEST 5: Audit history retrieval and authorization
  it("should allow only authorized users to view ticket audit history", async () => {
    const ticket = await createTestTicket({
      assignedTo: agent._id,
    });

    await AuditLog.create({
      performedBy: customer._id,
      action: "TICKET_CREATED",
      entityType: "Ticket",
      entityId: ticket._id,
      changes: { title: "Test ticket" },
    });

    // Ticket owner can view history
    let response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${ticket._id}`,
      customer
    );

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);

    // Assigned agent can view history
    response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${ticket._id}`,
      agent
    );

    expect(response.status).toBe(200);

    // Another customer cannot view history
    response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${ticket._id}`,
      anotherCustomer
    );

    expect(response.status).toBe(403);

    // An unassigned agent cannot view history
    response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${ticket._id}`,
      anotherAgent
    );

    expect(response.status).toBe(403);

    // Admin can view history
    response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${ticket._id}`,
      admin
    );

    expect(response.status).toBe(200);
  });

  // TEST 6: Admin can view deleted ticket history
  it("should allow admin to view audit history after ticket deletion", async () => {
    const ticket = await createTestTicket();

    await authRequest(
      "delete",
      `/api/tickets/${ticket._id}`,
      admin
    );

    const response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${ticket._id}`,
      admin
    );

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.data[0].action).toBe(
      "TICKET_DELETED"
    );
  });

  // TEST 7: Invalid ticket ID
  it("should reject an invalid ticket ID", async () => {
    const response = await authRequest(
      "get",
      "/api/audit-logs/tickets/invalid-id",
      admin
    );

    expect(response.status).toBe(400);
  });

  // TEST 8: Non-admin cannot view missing ticket history
  it("should return 404 when a customer requests history for a missing ticket", async () => {
    const missingTicketId = new mongoose.Types.ObjectId();

    const response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${missingTicketId}`,
      customer
    );

    expect(response.status).toBe(404);
  });

  // TEST 9: Empty audit history
  it("should return an empty array when a ticket has no audit history", async () => {
    const ticket = await createTestTicket();

    const response = await authRequest(
      "get",
      `/api/audit-logs/tickets/${ticket._id}`,
      customer
    );

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);
    expect(response.body.data).toEqual([]);
  });

});
