javascript
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
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

    // Verify the connection is alive
    const isConnected = client.topology?.isConnected?.() ?? false;

    // Calculate uptime in seconds
    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

    if (!isConnected) {
      // Return a graceful error payload but keep HTTP status 200
      return NextResponse.json(
        {
          status: 'error',
          message: 'MongoDB client not connected',
          version: APP_VERSION,
          uptime_seconds: uptimeSeconds,
        },
        { status: 200, headers }
      );
    }

    // Return health status with version and uptime
    return NextResponse.json(
      {
        status: 'OK',
        version: APP_VERSION,
        uptime_seconds: uptimeSeconds,
      },
      { status: 200, headers }
    );
  } catch (error) {
    // Return error details while still responding with HTTP 200
    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
    return NextResponse.json(
      {
        status: 'error',
        message: error?.message || 'Unexpected error',
        version: APP_VERSION,
        uptime_seconds: uptimeSeconds,
      },
      { status: 200, headers }
    );
  }
}