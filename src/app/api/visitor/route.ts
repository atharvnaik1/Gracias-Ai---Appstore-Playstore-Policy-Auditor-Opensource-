import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { Visitor } from '../../../models/Visitor';

export const revalidate = 0; // Disable caching

export async function GET() {
  try {
    await dbConnect();
    
    const VisitorModel = Visitor as any;
    const visitorRecord = await VisitorModel.findOneAndUpdate(
      { label: 'global' },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );

    return NextResponse.json({ count: visitorRecord.count }, { status: 200 });
  } catch (error) {
    console.warn('Visitor counter unavailable:', error);
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
