import mongoose from "mongoose";

/**
 * - Audit log document shape
 * An append-only record of every privileged action an administrator took:
 * who did it, to what, and when. Like the ledger, entries are written once
 * and never edited - an admin can read this collection but not rewrite history.
 */
export interface IAudit {
  /** the administrator who performed the action */
  actor: mongoose.Types.ObjectId;
  /** the email of the actor at the time, kept so the log still reads if the user is deleted */
  actorEmail?: string;
  /** what was done */
  action:
    | "ACCOUNT_FROZEN"
    | "ACCOUNT_UNFROZEN"
    | "ACCOUNT_CLOSED"
    | "ACCOUNT_REOPENED"
    | "FUNDS_ISSUED"
    | "TRANSACTION_REVERSED"
    | "LOGIN_LOCKED"
    | "ALL_SESSIONS_REVOKED";
  /** which collection the target belongs to */
  targetType: "ACCOUNT" | "USER" | "TRANSACTION" | "SESSION";
  /** the id of the document that was changed */
  targetId: mongoose.Types.ObjectId;
  /** a short human line, shown in the admin log */
  summary: string;
  /** structured detail (amounts, previous and new status, reason) */
  detail?: Record<string, unknown>;
  /** set automatically by `timestamps: true` */
  createdAt: Date;
  /** set automatically by `timestamps: true` */
  updatedAt: Date;
}

/**
 * - Audit schema definition
 * Declares the append-only administrator action log.
 */
const auditSchema = new mongoose.Schema<IAudit>(
  {
    // the administrator who performed the action
    actor: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Actor is required"],
      index: true,
    },

    // the actor's email at the time of the action
    actorEmail: {
      type: String,
      trim: true,
    },

    // what was done
    action: {
      type: String,
      enum: {
        values: [
          "ACCOUNT_FROZEN",
          "ACCOUNT_UNFROZEN",
          "ACCOUNT_CLOSED",
          "ACCOUNT_REOPENED",
          "FUNDS_ISSUED",
          "TRANSACTION_REVERSED",
          "LOGIN_LOCKED",
          "ALL_SESSIONS_REVOKED",
        ],
        message: "Unknown audit action",
      },
      required: [true, "Action is required"],
    },

    // which collection the target belongs to
    targetType: {
      type: String,
      enum: ["ACCOUNT", "USER", "TRANSACTION", "SESSION"],
      required: [true, "Target type is required"],
    },

    // the id of the document that was changed
    targetId: {
      ref: "Account",
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Target is required"],
      index: true,
    },

    // a short human line, shown in the admin log
    summary: {
      type: String,
      required: [true, "Summary is required"],
      trim: true,
    },

    // structured detail (amounts, previous and new status, reason)
    detail: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    // adds `createdAt` and `updatedAt` automatically
    timestamps: true,
  },
);

/**
 * - Newest first, per action and per target
 * The admin log only ever reads "the newest entries", optionally filtered by
 * what was done or which account was touched.
 */
auditSchema.index({ createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });
auditSchema.index({ targetId: 1, createdAt: -1 });

/**
 * - Block audit mutations
 * Rejects any update, replace or delete on the audit log, so the record of
 * what an administrator did cannot be altered after the fact.
 *
 * @throws {Error} always - the mutation is never allowed to proceed
 */
function preventAuditMutation(): never {
  throw new Error("Audit log entries are immutable");
}

auditSchema.pre("findOneAndUpdate", preventAuditMutation);
auditSchema.pre("updateOne", preventAuditMutation);
auditSchema.pre("updateMany", preventAuditMutation);
auditSchema.pre("deleteOne", preventAuditMutation);
auditSchema.pre("deleteMany", preventAuditMutation);
auditSchema.pre("findOneAndDelete", preventAuditMutation);
auditSchema.pre("findOneAndReplace", preventAuditMutation);
auditSchema.pre("replaceOne", preventAuditMutation);

/**
 * - Audit model
 * Compiled Mongoose model for the `audits` collection.
 */
const auditModel = mongoose.model<IAudit>("Audit", auditSchema);
export default auditModel;
