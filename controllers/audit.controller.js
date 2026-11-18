import mongoose from "mongoose";

import AuditLog from "../models/auditLog.model.js";
import Ticket from "../models/ticket.model.js";
import AppError from "../utils/AppError.js";

export const getTicketAuditLogs = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    // 1. Validate ticket ID
    if (!mongoose.isValidObjectId(ticketId)) {
      return next(new AppError("Invalid ticket ID", 400));
    }

    // 2. Find ticket
    const ticket = await Ticket.findById(ticketId);

    // 3. Check authorization
    if (req.user.role !== "admin") {
      if (!ticket) {
        return next(new AppError("Ticket not found", 404));
      }

      if (req.user.role === "customer") {
        if (String(ticket.createdBy) !== String(req.user.userId)) {
          return next(new AppError("You are not authorized to view this audit history", 403));
        }
      } else if (req.user.role === "agent") {
        if (String(ticket.assignedTo) !== String(req.user.userId)) {
          return next(new AppError("You are not authorized to view this audit history", 403));
        }
      }
    }

    // 4. Retrieve audit history
    const logs = await AuditLog.find({
      entityId: ticketId,
      entityType: "Ticket",
    })
      .populate("performedBy", "name email")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      message: "Audit history retrieved successfully",
      count: logs.length,
      data: logs,
    });

  } catch (error) {
    next(error);
  }
};