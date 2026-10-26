import type { Metadata } from "next";
import { TransferView } from "@/features/transfer/transfer-view";

export const metadata: Metadata = {
  title: "Send money · Banking",
};

/**
 * - Transfer page (`/transfer`)
 * Idempotent transfer form with pending, success, already-processed and
 * still-processing states.
 */
export default function TransferPage() {
  return <TransferView />;
}
