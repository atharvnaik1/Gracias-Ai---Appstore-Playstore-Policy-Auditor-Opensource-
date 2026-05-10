javascript
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
let client;

export async function GET() {
  try {
    // Initialize and connect the MongoDB client if not already connected
    if (!client) {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
    }

    // Verify the connection is alive
    const isConnected = client.topology?.isConnected?.() ?? false;
    if (!isConnected) {
      return NextResponse.json(
        { status: 'error', message: 'MongoDB client not connected' },
        { status: 500 }
      );
    }

    // Return health status
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}