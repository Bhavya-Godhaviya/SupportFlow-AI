import AuditLog from "../models/auditLog.model.js";

const createAuditLog = async ({
  req,
  action,
  entityId,
  changes = {},
}) => {
  try {
    await AuditLog.create({
      performedBy: req.user.userId,
      action,
      entityType: "Ticket",
      entityId,
      changes,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
  } catch (error) {
    // Audit logging failures should be visible to server monitoring.
    console.error("Audit log creation failed:", error);
    throw error;
  }
};

export default createAuditLog;