/**
 * - Create (or promote) a system user
 * Nothing in the app creates a `systemUser: true` account, and the flag is
 * `immutable` on the schema, so it can only be set when the document is
 * inserted - never by a later update. This script is the supported way to
 * provision an administrator for the funding endpoint.
 *
 * Usage:
 *   bun scripts/create-system-user.ts <email> <password> [name]
 *
 * If the email already exists the account is promoted by inserting the
 * `systemUser` field at the driver level, because Mongoose refuses to change
 * an immutable path via `save()`.
 */
import mongoose from "mongoose";
import userModel from "../src/models/user.model";

/** The password is hashed with the same Bun bcrypt settings as the schema. */
async function hash(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });
}

async function main(): Promise<void> {
  const [email, password, name = "System User"] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      "Usage: bun scripts/create-system-user.ts <email> <password> [name]",
    );
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Password must be at least 6 characters");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error("no database handle after connect");

  const normalized = email.trim().toLowerCase();
  const existing = await userModel.findOne({ email: normalized });

  if (existing) {
    if (existing.systemUser) {
      console.log(
        `[seed] ${normalized} is already a system user (${existing._id})`,
      );
      await mongoose.disconnect();
      return;
    }

    // the flag is immutable in the schema, so bypass Mongoose for this one
    // field; the password hash has to be written directly for the same reason
    await db
      .collection("users")
      .updateOne(
        { _id: existing._id },
        { $set: { systemUser: true, password: await hash(password), name } },
      );
    console.log(
      `[seed] promoted ${normalized} to a system user (${existing._id})`,
    );
    await mongoose.disconnect();
    return;
  }

  const user = new userModel({
    email: normalized,
    name,
    password,
    confirmPassword: password,
    systemUser: true,
  });

  await user.save();
  console.log(`[seed] created system user ${normalized} (${user._id})`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[seed] FAILED:", (error as Error).message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
