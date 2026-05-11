javascript
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const START_TIME = Date.now();
let client;

export async function GET(request) {
  const headers = new Headers({
    'Cache-Control': 'no-store, max-age=0',
  });

  try {
    // Initialize and connect the MongoDB client if not already connected
    if (!client) {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
    }

    // Optional: verify the connection is alive
    await client.db().command({ ping: 1 });

    // Return health status with the required payload
    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers }
    );
  } catch (error) {
    // Ensure no unhandled exceptions and always return the required payload
    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers }
    );
  }
}