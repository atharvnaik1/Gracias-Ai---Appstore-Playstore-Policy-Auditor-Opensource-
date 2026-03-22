import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { Report } from '../../../models/Report';

const MAX_REPORT_SIZE = 500_000; // 500KB max report content

export async function POST(req: NextRequest) {
  try {
    const { reportContent, filesScanned } = await req.json();

    if (!reportContent || filesScanned === undefined) {
      return NextResponse.json({ error: 'Missing report data' }, { status: 400 });
    }

    if (typeof reportContent !== 'string' || reportContent.length > MAX_REPORT_SIZE) {
      return NextResponse.json({ error: 'Report content too large' }, { status: 400 });
    }

    await dbConnect();

    const ReportModel = Report as any;
    const newReport = await ReportModel.create({
      reportContent,
      filesScanned
    });

    return NextResponse.json({ success: true, reportId: newReport._id }, { status: 201 });
  } catch (error) {
    console.error('Save Report DB Error:', error);
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }
}
