import type { Metadata } from "next";
import { HistoryView } from "@/features/history/history-view";

export const metadata: Metadata = {
  title: "History",
};

/**
 * History for one account (`/history?account=<id>`). The account travels in
 * the query string because a static export cannot pre-render one page per
 * account id; without it, the view lists the accounts to choose from.
 */
export default function HistoryPage() {
  return <HistoryView />;
}
