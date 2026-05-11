ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import Busboy from 'busboy';

// Disable Next.js default body parser for multipart/form‑data
export const config = {
  api: {
    bodyParser: false,
  },
};

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_UPLOAD_SIZE = 150 * 1024 * 1024; // 150 MiB
const UPLOAD_TEMP_TTL_MS = 30 * 60 * 1000; // 30 minutes
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'text/plain',
  // add more as needed
];

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;

  try {
    // Create a temporary directory (under /tmp)
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gracias-upload-'));

    const contentType = req.headers.get('content-type') || '';

    // Convert Web ReadableStream to Node.js Readable
    const reader = req.body!.getReader();
    const nodeStream = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            this.push(Buffer.from(value));
          }
        } catch (err) {
          this.destroy(err as Error);
        }
      },
    });

    const parsed = await new Promise<{
      fileName: string;
      filePath: string;
      mimeType: string;
    }>((resolve, reject) => {
      const busboy = Busboy({
        headers: { 'content-type': contentType },
        limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 },
      });

      let fileName = '';
      let filePath = '';
      let mimeType = '';
      let fileReceived = false;
      let writeFinished = false;
      let busboyFinished = false;
      let rejected = false;

      const tryResolve = () => {
        if (busboyFinished && writeFinished && !rejected) {
          resolve({ fileName, filePath, mimeType });
        }
      };

      const safeReject = (err: Error) => {
        if (!rejected) {
          rejected = true;
          reject(err);
        }
      };

      busboy.on('file', (fieldname, fileStream, info) => {
        if (fieldname !== 'file') {
          (fileStream as any).resume();
          return;
        }

        fileName = info.filename || 'upload.bin';
        mimeType = info.mimeType || 'application/octet-stream';
        filePath = path.join(tempDir!, fileName);
        fileReceived = true;

        // MIME type validation
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
          safeReject(new Error(`Unsupported file type: ${mimeType}`));
          (fileStream as any).resume();
          return;
        }

        const writeStream = createWriteStream(filePath);
        (fileStream as NodeJS.ReadableStream).pipe(writeStream);

        writeStream.on('finish', () => {
          writeFinished = true;
          tryResolve();
        });

        writeStream.on('error', safeReject);
        (fileStream as any).on('limit', () =>
          safeReject(new Error('File exceeds maximum allowed size')),
        );
      });

      busboy.on('finish', () => {
        busboyFinished = true;
        if (!fileReceived) {
          safeReject(new Error('No file uploaded'));
        } else {
          tryResolve();
        }
      });

      busboy.on('error', safeReject);
      nodeStream.pipe(busboy);
    });

    // Get file size
    const stats = await fs.stat(parsed.filePath);
    const fileSize = stats.size;

    // Build a simple file URL (local temporary path)
    const fileUrl = `file://${parsed.filePath}`;

    // Schedule cleanup of the temporary directory
    setTimeout(() => {
      fs.rm(tempDir!, { recursive: true, force: true }).catch(() => {});
    }, UPLOAD_TEMP_TTL_MS).unref?.();

    // Return JSON payload with URL and size
    return NextResponse.json({
      fileUrl,
      size: fileSize,
      mimeType: parsed.mimeType,
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    // Return specific error status for validation errors
    const status = error.message?.startsWith('Unsupported file type') ||
      error.message?.startsWith('File exceeds maximum allowed size') ||
      error.message?.startsWith('No file uploaded')
      ? 400
      : 500;

    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status },
    );
  }
}