ts
import mongoose, { ConnectOptions } from 'mongoose';

type Cached = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: Cached | undefined;
}

// Initialize cache on the global object
let cached = globalThis.mongooseCache ?? {
  conn: null,
  promise: null,
};
globalThis.mongooseCache = cached;

/**
 * Helper: wait for a given number of milliseconds.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect to MongoDB using the URI defined in `process.env.MONGODB_URI`.
 * Implements retry logic, provides detailed error messages, and caches the connection.
 */
export async function dbConnect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      '❌ Missing environment variable: MONGODB_URI. Please define it in .env.local.'
    );
  }

  // Return existing connection if present
  if (cached.conn) {
    return cached.conn;
  }

  // If a connection promise already exists, reuse it
  if (cached.promise) {
    return cached.promise;
  }

  const maxRetries = 3;
  const baseDelayMs = 500;

  const options: ConnectOptions = {
    bufferCommands: false,
  };

  // Retry loop
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      cached.promise = mongoose.connect(uri, options);
      cached.conn = await cached.promise;
      // Successful connection – break out of retry loop
      break;
    } catch (err) {
      // Reset promise so next iteration can retry
      cached.promise = null;
      const error = err as Error;
      console.error(
        `⚠️ MongoDB connection attempt ${attempt} of ${maxRetries} failed: ${error.message}`
      );

      if (attempt === maxRetries) {
        // Exhausted retries – throw a detailed error
        throw new Error(
          `❌ Unable to connect to MongoDB after ${maxRetries} attempts. ` +
            `Check your connection string, network, and database status. Original error: ${error.message}`
        );
      }

      // Exponential backoff before next retry
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      await delay(backoff);
    }
  }

  if (!cached.conn) {
    // This should never happen, but TypeScript requires a guard
    throw new Error('❌ MongoDB connection failed without a specific error.');
  }

  return cached.conn;
}

/**
 * Gracefully close the mongoose connection.
 */
export async function dbClose() {
  if (cached.conn) {
    try {
      await mongoose.disconnect();
    } catch (err) {
      console.error(`⚠️ Error while disconnecting from MongoDB: ${(err as Error).message}`);
    } finally {
      cached.conn = null;
      cached.promise = null;
    }
  }
}

/**
 * Ensure the mongoose client is closed on process termination.
 */
const shutdown = async (signal: string) => {
  console.info(`🛑 Received ${signal}. Closing MongoDB connection...`);
  await dbClose();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('beforeExit', async () => {
  await dbClose();
});

/**
 * Export the underlying mongoose instance for reusable client usage.
 */
export const mongooseClient = mongoose;