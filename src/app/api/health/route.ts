javascript
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let client;

export async function GET(request) {
  const headers = new Headers({
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json',
  });

  try {
    if (!client) {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
    }

    // Verify the connection is alive
    await client.db().command({ ping: 1 });

    const vercelInfo = {
      env: process.env.VERCEL_ENV || 'unknown',
      url: process.env.VERCEL_URL || 'unknown',
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    };

    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        vercel: vercelInfo,
      },
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers }
    );
  }
}