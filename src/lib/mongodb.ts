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
 * Connect to MongoDB using the URI defined in `process.env.MONGODB_URI`.
 * Throws an error if the environment variable is missing.
 * Returns a cached connection if one already exists.
 */
export async function dbConnect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  }

  // Return existing connection if present
  if (cached.conn) {
    return cached.conn;
  }

  // Create a connection promise if it doesn't exist yet
  if (!cached.promise) {
    const options: ConnectOptions = {
      bufferCommands: false,
    };
    cached.promise = mongoose.connect(uri, options);
  }

  // Await the connection promise and cache the result
  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * Export the underlying mongoose instance for reusable client usage.
 */
export const mongooseClient = mongoose;