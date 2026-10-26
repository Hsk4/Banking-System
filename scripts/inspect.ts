/**
 * - Read-only inspection of the database
 * Prints the environment, the treasury, the accounts, the indexes and any
 * running index builds so a transfer failure can be diagnosed without
 * guessing. Never prints the connection string or any credential.
 *
 * Usage: bun scripts/inspect.ts
 */
import mongoose from "mongoose";
import accountModel from "../src/models/account.model";
import transactionModel from "../src/models/transaction.model";
import ledgerModel from "../src/models/ledger.model";

function redact(uri: string): string {
  const scheme = uri.split("://")[0];
  const host = uri.split("@").pop()?.split("/")[0] ?? "";
  return `${scheme}://***@${host}`;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  console.log("[inspect] uri:", redact(uri));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error("no database handle after connect");

  // which database did we actually land on?
  console.log("[inspect] database:", db.databaseName);

  const hello = await db.admin().command({ hello: 1 });
  console.log("[inspect] topology:", {
    setName: hello.setName ?? null,
    isWritablePrimary: hello.isWritablePrimary ?? null,
    msg: hello.msg ?? null,
  });

  // collections that exist right now
  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  console.log("[inspect] collections:", collections);

  const treasury = await accountModel.findOne({ code: "TREASURY" }).lean();
  console.log(
    "[inspect] treasury:",
    treasury
      ? {
          _id: String(treasury._id),
          type: treasury.type,
          status: treasury.status,
          users: treasury.users?.length ?? 0,
        }
      : "MISSING",
  );

  const accounts = await accountModel
    .find({})
    .select("_id users type code status currency createdAt")
    .lean();
  console.log("[inspect] accounts:", accounts.length);
  for (const account of accounts) {
    console.log("  ", {
      _id: String(account._id),
      type: account.type ?? "(none)",
      code: account.code ?? "",
      status: account.status,
      owners: account.users?.length ?? 0,
    });
  }

  console.log(
    "[inspect] transactions:",
    await transactionModel.countDocuments(),
    "ledgers:",
    await ledgerModel.countDocuments(),
  );

  for (const model of [accountModel, transactionModel, ledgerModel]) {
    try {
      const indexes = await model.collection.indexes();
      console.log(
        `[inspect] indexes on ${model.collection.collectionName}:`,
        indexes.map((i) => `${i.name}${i.unique ? " UNIQUE" : ""}`),
      );
    } catch (error) {
      console.log(
        `[inspect] indexes on ${model.collection.collectionName}: ERROR`,
        (error as Error).message,
      );
    }
  }

  // an index build blocks writes while it runs
  const builds: unknown[] = [];
  for (const name of ["accounts", "transactions", "ledgers"]) {
    try {
      const cursor = db
        .collection(name)
        .aggregate([
          { $currentOp: {} },
          { $match: { indexBuild: { $exists: true } } },
        ]);
      builds.push(...(await cursor.toArray()));
    } catch {
      // not supported on a standalone / older server - ignore
    }
  }
  console.log("[inspect] running index builds:", builds.length);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[inspect] FAILED:", (error as Error).message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
