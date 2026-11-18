import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    action: {
      type: String,
      enum: [
        "TICKET_CREATED",
        "TICKET_UPDATED",
        "TICKET_ASSIGNED",
        "TICKET_DELETED",
      ],
      required: true,
    },

    entityType: {
      type: String,
      default: "Ticket",
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
    },

    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
    },

    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Efficiently retrieve ticket activity history
auditLogSchema.index({
  entityId: 1,
  createdAt: -1,
});

// Efficiently retrieve activity by user
auditLogSchema.index({
  performedBy: 1,
  createdAt: -1,
});

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;