import mongoose from "mongoose";
import Ticket from "../models/ticket.model.js";
import Comment from "../models/comment.model.js";

// Reusable authorization helper
const canAccessTicket = (ticket, user) => {
  const userId = String(user.userId);

  // Admin can access every ticket.
  if (user.role === "admin") {
    return true;
  }

  // Customer can access only tickets they created.
  if (user.role === "customer") {
    return String(ticket.createdBy) === userId;
  }

  // Agent can access only tickets assigned to them.
  if (user.role === "agent") {
    return (
      ticket.assignedTo &&
      String(ticket.assignedTo) === userId
    );
  }

  return false;
};

// Create a comment
export const createComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    // 1. Validate ticket ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID",
      });
    }

    // 2. Validate message
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment message is required",
      });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot exceed 2000 characters",
      });
    }

    // 3. Find ticket
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // 4. Check authorization
    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this ticket",
      });
    }

    // 5. Create comment
    const comment = await Comment.create({
      ticket: ticket._id,
      user: req.user.userId,
      message: message.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data: comment,
    });

  } catch (error) {
    next(error);
  }
};

// Get comments with pagination
export const getComments = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Validate ticket ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID",
      });
    }

    // 2. Validate pagination
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Page and limit must be positive integers",
      });
    }

    // Prevent excessively large requests.
    const safeLimit = Math.min(limit, 100);

    // 3. Find ticket
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // 4. Check authorization
    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this ticket",
      });
    }

    // 5. Calculate pagination
    const skip = (page - 1) * safeLimit;

    // 6. Fetch comments
    const [comments, totalComments] = await Promise.all([
      Comment.find({ ticket: id })
        .populate("user", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),

      Comment.countDocuments({ ticket: id }),
    ]);

    const totalPages = Math.ceil(totalComments / safeLimit);

    return res.status(200).json({
      success: true,
      message: "Comments fetched successfully",
      data: comments,
      pagination: {
        currentPage: page,
        limit: safeLimit,
        totalComments,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });

  } catch (error) {
    next(error);
  }
};