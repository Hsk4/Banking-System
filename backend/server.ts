import app from "./src/app";
import connectDB from "./src/config/db";
import { ensureTreasury } from "./src/services/treasury.service";
import { backfillAccountNumbers } from "./src/services/accountNumber.service";

/**
 * - Application entry point
 * Connects to MongoDB and only then opens the HTTP listener, so the API never
 * serves requests against a database it cannot reach.
 *
 * The port is allotted through `PORT` in `.env.local` (Bun loads it
 * automatically) and falls back to 3000 when it is not set.
 */
async function start(): Promise<void> {
  try {
    await connectDB();
    // the treasury must exist before the first funding request can be served
    await ensureTreasury();
    // accounts created before short numbers existed get one here, so the
    // recipient lookup works for every customer without a manual migration
    const assigned = await backfillAccountNumbers();
    if (assigned > 0) {
      console.log(`Assigned short account numbers to ${assigned} account(s)`);
    }
  } catch (error) {
    // without a database every request would fail - stop instead of starting
    console.error("Could not connect to MongoDB:", error);
    process.exit(1);
  }

  const PORT = Number(process.env.PORT ?? 3000);

  app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
  });
}

start();
