import express from "express";

import { getTicketAuditLogs } from "../controllers/audit.controller.js";

import { protect }  from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/authorize.middleware.js"

const router = express.Router();

router.get(
  "/tickets/:ticketId",
  protect,
  authorizeRoles("customer", "agent", "admin"),
  getTicketAuditLogs
);

export default router;