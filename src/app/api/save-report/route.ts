typescript
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { Report } from '../../../models/Report';

const MAX_REPORT_SIZE = 500_000; // 500KB max report content

/** Simple schema validation */
function validatePayload(payload: any) {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Request body must be a JSON object');
    return errors;
  }

  const { reportContent, filesScanned } = payload;

  if (typeof reportContent !== 'string') {
    errors.push('reportContent must be a string');
  } else if (reportContent.length === 0) {
    errors.push('reportContent cannot be empty');
  } else if (reportContent.length > MAX_REPORT_SIZE) {
    errors.push(`reportContent exceeds maximum size of ${MAX_REPORT_SIZE} characters`);
  }

  if (!Array.isArray(filesScanned)) {
    errors.push('filesScanned must be an array');
  } else {
    const nonString = filesScanned.some((f) => typeof f !== 'string');
    if (nonString) errors.push('All items in filesScanned must be strings');
  }

  return errors;
}

export async function POST(req: NextRequest) {
  // 1️⃣ Parse and validate payload
  let payload: any;
  try {
    payload = await req.json();
  } catch (e) {
    console.error('Invalid JSON:', e);
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const validationErrors = validatePayload(payload);
  if (validationErrors.length) {
    return NextResponse.json(
      { error: 'Validation failed', details: validationErrors },
      { status: 400 }
    );
  }

  // 2️⃣ Persist to MongoDB
  try {
    await dbConnect();

    const ReportModel = Report as any; // Mongoose model
    const newReport = await ReportModel.create({
      reportContent: payload.reportContent,
      filesScanned: payload.filesScanned,
    });

    return NextResponse.json(
      { success: true, reportId: newReport._id },
      { status: 201 }
    );
  } catch (dbError) {
    console.error('Database error while saving report:', dbError);
    // Distinguish validation errors from DB errors if possible
    const message =
      dbError && (dbError as any).message
        ? (dbError as any).message
        : 'Failed to save report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}