/**
 * - What a status badge means
 * A badge alone tells a person nothing to do. Every status that needs an
 * action gets one line saying what happened and what to do next, shown beside
 * the badge and used as its `title`.
 */

/** The explanation for a status, or null when it needs none. */
export function statusHelp(status: string): string | null {
  switch (status) {
    case "FROZEN":
      return "Frozen: money cannot move in or out. Contact support to unfreeze it.";
    case "CLOSED":
      return "Closed: this account can no longer send or receive money.";
    case "PENDING":
      return "Processing: the transfer has been accepted and is being completed.";
    case "FAILED":
      return "Failed: nothing was moved. Start the transfer again to retry.";
    case "REVERSED":
      return "Reversed: the money was returned to the account it came from.";
    default:
      return null;
  }
}

/** A short label for the badge, so ACTIVE reads as plain "Active". */
export function statusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "FROZEN":
      return "Frozen";
    case "CLOSED":
      return "Closed";
    case "COMPLETED":
      return "Completed";
    case "PENDING":
      return "Processing";
    case "FAILED":
      return "Failed";
    case "REVERSED":
      return "Reversed";
    default:
      return status;
  }
}
