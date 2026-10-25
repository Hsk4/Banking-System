import mongoose from "mongoose";

/**
 * - Connection state
 * `false` before the first attempt, then `true` once connected and back to
 * `false` if the connection drops. `connectDB` waits for the initial attempt.
 */
let connected = false;

mongoose.connection.on("connected", () => {
  connected = true;
});

mongoose.connection.on("disconnected", () => {
  connected = false;
});

/**
 * - Connect to the MongoDB database
 * Opens a single shared connection using the `MONGODB_URI` connection string
 * from the environment. Mongoose manages the connection, so this only needs
 * to be called once at application startup.
 *
 * NOTE: this resolves only after the initial connection attempt. It rejects
 * on failure so the caller can refuse to start the server - otherwise the API
 * would accept requests that then fail one by one with buffering timeouts.
 *
 * @returns {Promise<void>} - resolves once MongoDB is connected
 * @throws {Error} - when the connection string is missing or the connection fails
 */
export default async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  // fail after 10s instead of hanging indefinitely on an unreachable cluster
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  console.log("MongoDB connected successfully");
}

/**
 * - Whether MongoDB is currently connected
 * Useful for health checks and for guarding queries while the connection is
 * re-establishing.
 *
 * @returns `true` when Mongoose has an established connection
 */
export { connected };
