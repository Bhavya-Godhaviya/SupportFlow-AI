import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/authorize.middleware.js";
import {getTickets, 
    createTicket, 
    getTicketById,
    updateTicket,
    deleteTicket,
    getMyTickets,
    assignTicket,
    getAssignedTickets} from "../controllers/ticket.controller.js"
import { createComment, getComments } from "../controllers/comment.controller.js";
import validateTicket from "../middleware/validateTicket.js";

const router = express.Router();

// All roles: Create ticket
/**
 * @swagger
 * /api/tickets:
 *   post:
 *     summary: Create a new ticket
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *                 example: Login issue
 *               description:
 *                 type: string
 *                 example: Unable to login to my account
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 */
router.post("/", protect, authorizeRoles("customer", "agent", "admin"), validateTicket, createTicket);

// Customer: View own tickets
/**
 * @swagger
 * /api/tickets/my:
 *   get:
 *     summary: Get tickets created by the logged-in customer
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Customer tickets retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only customers can access this endpoint
 */
router.get("/my", protect, authorizeRoles("customer"), getMyTickets);

/**
 * @swagger
 * /api/tickets/assigned:
 *   get:
 *     summary: Get tickets assigned to the logged-in agent
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned tickets retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only agents can access this endpoint
 */
router.get("/assigned", protect, authorizeRoles("agent"), getAssignedTickets);

// Agent and Admin: View all tickets
/**
 * @swagger
 * /api/tickets:
 *   get:
 *     summary: Get all tickets
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in-progress, resolved, closed]
 *         description: Filter tickets by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Tickets retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get("/", protect, authorizeRoles("agent", "admin"), getTickets);

// Ticket conversation routes
/**
 * @swagger
 * /api/tickets/{id}/comments:
 *   post:
 *     summary: Add a comment to a ticket
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: I am investigating this issue.
 *     responses:
 *       201:
 *         description: Comment created successfully
 *       400:
 *         description: Invalid comment data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You cannot comment on this ticket
 *       404:
 *         description: Ticket not found
 */
router.post(
    "/:id/comments",
    protect,
    authorizeRoles("customer", "agent", "admin"),
    createComment
);
  
/**
 * @swagger
 * /api/tickets/{id}/comments:
 *   get:
 *     summary: Get comments for a ticket
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 *       400:
 *         description: Invalid ticket ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You cannot access these comments
 *       404:
 *         description: Ticket not found
 */
router.get(
    "/:id/comments",
    protect,
    authorizeRoles("customer", "agent", "admin"),
    getComments
);

// All roles: View ticket (customer ownership checked in controller)
/**
 * @swagger
 * /api/tickets/{id}:
 *   get:
 *     summary: Get a ticket by ID
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ticket ID
 *     responses:
 *       200:
 *         description: Ticket retrieved successfully
 *       400:
 *         description: Invalid ticket ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: You cannot access this ticket
 *       404:
 *         description: Ticket not found
 */
router.get("/:id", protect, authorizeRoles("customer", "agent", "admin"), getTicketById);

// Agent and Admin: Update ticket
/**
 * @swagger
 * /api/tickets/{id}:
 *   patch:
 *     summary: Partially update a ticket
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Login issue updated
 *               description:
 *                 type: string
 *                 example: Login issue still exists
 *               status:
 *                 type: string
 *                 enum: [open, in-progress, resolved, closed]
 *                 example: in-progress
 *     responses:
 *       200:
 *         description: Ticket updated successfully
 *       400:
 *         description: Invalid request or status transition
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Ticket not found
 */
router.patch("/:id", protect, authorizeRoles("agent", "admin"), updateTicket);

/**
 * @swagger
 * /api/tickets/{id}:
 *   put:
 *     summary: Replace ticket information
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *             properties:
 *               title:
 *                 type: string
 *                 example: Updated login issue
 *               description:
 *                 type: string
 *                 example: Updated ticket description
 *               status:
 *                 type: string
 *                 enum: [open, in-progress, resolved, closed]
 *                 example: open
 *     responses:
 *       200:
 *         description: Ticket replaced successfully
 *       400:
 *         description: Invalid ticket data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Ticket not found
 */
router.put("/:id", protect, authorizeRoles("agent", "admin"), validateTicket, updateTicket);

// Admin only: Delete ticket
/**
 * @swagger
 * /api/tickets/{id}:
 *   delete:
 *     summary: Delete a ticket
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket deleted successfully
 *       400:
 *         description: Invalid ticket ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only admins can delete tickets
 *       404:
 *         description: Ticket not found
 */
router.delete("/:id", protect, authorizeRoles("admin"), deleteTicket);

//Admin can assign tickets to agent
/**
 * @swagger
 * /api/tickets/{id}/assign:
 *   patch:
 *     summary: Assign a ticket to an agent
 *     tags: [Ticket Assignment]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assignedTo
 *             properties:
 *               assignedTo:
 *                 type: string
 *                 example: 64f123456789abcdef123456
 *                 description: MongoDB ID of the agent
 *     responses:
 *       200:
 *         description: Ticket assigned successfully
 *       400:
 *         description: Invalid ticket or agent ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only admins can assign tickets
 *       404:
 *         description: Ticket or agent not found
 */
router.patch("/:id/assign", protect, authorizeRoles("admin"), assignTicket);


export default router;