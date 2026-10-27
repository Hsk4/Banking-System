import type mongoose from "mongoose";
import auditModel, { type IAudit } from "../models/audit.model";

/**
 * - Audit log
 * One function that everything privileged calls, so the log is written in the
 * same shape no matter which controller triggered it.
 *
 * Recording is best-effort on purpose: a failed audit write must not undo a
 * freeze that already happened, and it is logged to the server console
 * instead.
 */

/** Who is performing the action. */
interface Actor {
  _id: mongoose.Types.ObjectId;
  email?: string;
}

/** What happened. */
export interface AuditEntry {
  action: IAudit["action"];
  targetType: IAudit["targetType"];
  targetId: mongoose.Types.ObjectId;
  /** a short human line, required - it is what the admin reads */
  summary: string;
  /** structured detail such as the previous status or the amount */
  detail?: Record<string, unknown>;
}

/**
 * - Write one audit entry
 * @param actor - the administrator performing the action
 * @param entry - what happened
 * @returns the stored entry, or `null` when the write failed
 */
export async function record(
  actor: Actor,
  entry: AuditEntry,
): Promise<IAudit | null> {
  try {
    return await auditModel.create({
      actor: actor._id,
      actorEmail: actor.email,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      summary: entry.summary,
      detail: entry.detail,
    });
  } catch (error) {
    console.error("Could not write an audit entry", { entry, error });
    return null;
  }
}

export default { record };
