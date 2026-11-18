import mongoose from "mongoose";
import Ticket from "../models/ticket.model.js";
import User from "../models/user.model.js";
import AppError from "../utils/AppError.js";
import createAuditLog from "../utils/createAuditLog.js";
import emailQueue from "../queues/email.queue.js";

export const getTickets = async (req, res, next) => {
    try {
      const { status, page = 1, limit = 10 } = req.query;
  
      const pageNumber = Math.max(1, Number(page));
      const limitNumber = Math.min(50, Math.max(1, Number(limit)));
  
      const filter = {};
  
      if (status) {
        filter.status = status;
      }
  
      const tickets = await Ticket.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber);
  
      const totalTickets = await Ticket.countDocuments(filter);
  
      return res.status(200).json({
        success: true,
        count: tickets.length,
        totalTickets,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalTickets / limitNumber),
        data: tickets,
      });
    } catch (error) {
      next(error);
    }
};

export const createTicket = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    const ticket = await Ticket.create({
      title,
      description,
      createdBy: req.user.userId,
    });

    // Create audit log
    await createAuditLog({
      req,
      action: "TICKET_CREATED",
      entityId: ticket._id,
      changes: {
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
      },
    });

  // Queue ticket confirmation email
  try {
    const customer = await User.findById(req.user.userId);
    if (customer) {
      await emailQueue.add("ticket-confirmation", {
        to: customer.email,
        subject: "Your support ticket has been created!",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Hello ${customer.name},</h2>

            <p>Your support ticket has been successfully created.</p>

            <h3>Ticket Details</h3>

            <p><strong>Ticket ID:</strong> ${ticket._id}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Description:</strong> ${ticket.description}</p>
            <p><strong>Status:</strong> ${ticket.status}</p>

            <p>Our support team will review your request.</p>

            <strong>SupportFlow AI Team</strong>
          </div>
        `,
      });

      console.log("Ticket confirmation email job queued");
    }
  } catch (emailError) {
    console.error("Ticket confirmation queue failed:", emailError.message);
  }

    return res.status(201).json({
      success: true,
      message: "Ticket created successfully",
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};

export const getTicketById = async (req, res, next) => {
    try {
      const { id } = req.params;

      // Validate MongoDB ObjectId
      if (!mongoose.isValidObjectId(id)) {
        return next(new AppError("Invalid ticket ID", 400));
      }

      const ticket = await Ticket.findById(id);
  
      if (!ticket) {
        return next(new AppError("Ticket not found", 404));
      }
  
      if (
        req.user.role === "customer" &&
        ticket.createdBy?.toString() !== req.user.userId
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access this ticket"
        });
      }
  
      return res.status(200).json({
        success: true,
        message: "Ticket fetched successfully",
        data: ticket
      });
  
    } catch (error) {
      next(error);
    }
};

export const updateTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID",
      });
    }

    // 1. Find the ticket
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // 2. Check authorization
    if (req.user.role === "agent") {
      if (String(ticket.assignedTo) !== String(req.user.userId)) {
        return res.status(403).json({
          success: false,
          message: "You can only update tickets assigned to you",
        });
      }
    } else if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update tickets",
      });
    }

    // 3. Allow only specific fields
    const allowedFields = ["title", "description", "status"];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one valid field",
      });
    }

    // 4. Validate status transitions
    const allowedTransitions = {
      open: ["in-progress"],
      "in-progress": ["resolved"],
      resolved: ["closed"],
      closed: [],
    };

    if (updates.status && updates.status !== ticket.status) {
      const allowedNextStatuses = allowedTransitions[ticket.status];

      if (!allowedNextStatuses?.includes(updates.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot change status from ${ticket.status} to ${updates.status}`,
        });
      }
    }

    // 5. Capture actual changes before updating
    const changes = {};

    for (const field of allowedFields) {
      if (
        updates[field] !== undefined &&
        updates[field] !== ticket[field]
      ) {
        changes[field] = {
          from: ticket[field],
          to: updates[field],
        };
      }
    }

    // 6. Apply updates
    Object.assign(ticket, updates);
    await ticket.save();

    // 7. Create audit log if something actually changed
    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        req,
        action: "TICKET_UPDATED",
        entityId: ticket._id,
        changes,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket updated successfully",
      data: ticket,
    });

  } catch (error) {
    next(error);
  }
};

export const deleteTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Validate ticket ID
    if (!mongoose.isValidObjectId(id)) {
      return next(new AppError("Invalid ticket ID", 400));
    }

    // 2. Find ticket before deleting
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }

    // 3. Preserve ticket information for audit history
    const deletedTicketDetails = {
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      assignedTo: ticket.assignedTo
        ? String(ticket.assignedTo)
        : null,
    };

    // 4. Delete ticket
    await Ticket.findByIdAndDelete(id);

    // 5. Create audit log
    await createAuditLog({
      req,
      action: "TICKET_DELETED",
      entityId: ticket._id,
      changes: {
        deletedTicket: deletedTicketDetails,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Ticket deleted successfully",
    });

  } catch (error) {
    next(error);
  }
};

export const getMyTickets = async (req, res, next) => {
    try {
      const tickets = await Ticket.find({
        createdBy: req.user.userId,
      });
  
      return res.status(200).json({
        success: true,
        message: "Your tickets fetched successfully",
        count: tickets.length,
        data: tickets,
      });
  
    } catch (error) {
      next(error);
    }
};

export const assignTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    // 1. Validate ticket ID
    if (!mongoose.isValidObjectId(id)) {
      return next(new AppError("Invalid ticket ID", 400));
    }

    // 2. Validate agent ID
    if (!mongoose.isValidObjectId(agentId)) {
      return next(new AppError("Invalid agent ID", 400));
    }

    // 3. Check whether ticket exists
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }

    // 4. Check whether user exists and is an agent
    const agent = await User.findById(agentId);

    if (!agent) {
      return next(new AppError("Agent not found", 404));
    }

    if (agent.role !== "agent") {
      return next(new AppError("Selected user is not an agent", 400));
    }

    // 5. Capture previous assignment
    const previousAgentId = ticket.assignedTo
      ? String(ticket.assignedTo)
      : null;

    const newAgentId = String(agent._id);

    // 6. Assign ticket to agent
    ticket.assignedTo = agent._id;

    await ticket.save();

    // 7. Create audit log only if assignment changed
    if (previousAgentId !== newAgentId) {
      await createAuditLog({
        req,
        action: "TICKET_ASSIGNED",
        entityId: ticket._id,
        changes: {
          assignedTo: {
            from: previousAgentId,
            to: newAgentId,
          },
        },
      });
      // Queue assignment notification email
      try {
        await emailQueue.add("ticket-assignment", {
          to: agent.email,
          subject: `New ticket assigned: ${ticket.title}`,
          html: `
            <h2>Hello ${agent.name}</h2>
            <p>A new ticket has been assigned to you.</p>
            <p>${ticket.title}</p>
          `,
        });

        console.log("Assignment notification job queued");
      } catch (emailError) {
        console.error(
          "Agent assignment queue failed:",
          emailError.message
        );
      }
    }

    // 8. Return ticket with agent details
    await ticket.populate("assignedTo", "name email");

    return res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
      data: ticket,
    });

  } catch (error) {
    next(error);
  }
};

export const getAssignedTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find({
      assignedTo: req.user.userId,
    })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Assigned tickets fetched successfully",
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};