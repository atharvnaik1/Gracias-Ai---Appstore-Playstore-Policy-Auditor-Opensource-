typescript
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import { Report } from '../../../models/Report';

const MAX_REPORT_SIZE = 500_000; // 500KB max report content

interface ReportPayload {
  reportContent: string;
  filesScanned: string[];
}

/** Simple sanitization to remove script tags and potentially dangerous characters */
function sanitizeContent(content: string): string {
  // Remove <script>...</script> blocks
  const withoutScripts = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Escape angle brackets to prevent HTML injection
  return withoutScripts
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Validate request payload */
function validatePayload(payload: any): string[] {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Request body must be a JSON object');
    return errors;
  }

  const { reportContent, filesScanned } = payload as ReportPayload;

  if (typeof reportContent !== 'string') {
    errors.push('reportContent must be a string');
  } else if (!reportContent.trim()) {
    errors.push('reportContent cannot be empty');
  } else if (Buffer.byteLength(reportContent, 'utf8') > MAX_REPORT_SIZE) {
    errors.push(`reportContent exceeds maximum size of ${MAX_REPORT_SIZE} bytes`);
  }

  if (!Array.isArray(filesScanned)) {
    errors.push('filesScanned must be an array');
  } else {
    const invalid = filesScanned.some((f) => typeof f !== 'string');
    if (invalid) errors.push('All items in filesScanned must be strings');
  }

  return errors;
}

export async function POST(req: NextRequest) {
  // Parse JSON body
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Validate payload
  const validationErrors = validatePayload(payload);
  if (validationErrors.length) {
    return NextResponse.json(
      { error: 'Validation failed', details: validationErrors },
      { status: 400 }
    );
  }

  // Sanitize report content
  const sanitizedContent = sanitizeContent(payload.reportContent);

  // Persist to MongoDB
  try {
    await dbConnect();

    const newReport = await Report.create({
      reportContent: sanitizedContent,
      filesScanned: payload.filesScanned,
    });

    return NextResponse.json(
      { success: true, reportId: newReport._id },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Failed to save report:', err);
    // Provide a generic error without exposing internal details
    const errorMessage = err?.message?.includes('duplicate') ?
      'Report already exists' :
      'Failed to save report';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}