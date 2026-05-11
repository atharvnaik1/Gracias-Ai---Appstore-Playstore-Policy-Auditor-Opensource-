ts
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

type UploadResult = {
  fileUrl: string;
  size: number;
  mimeType: string;
  fileName: string;
};

type ErrorResult = {
  error: string;
};

export async function POST(req: NextRequest) {
  let tempDir: string | null = null;

  try {
    // Create temporary directory for the upload
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gracias-upload-'));

    const contentType = req.headers.get('content-type') ?? '';

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

    const parsed = await new Promise<UploadResult>((resolve, reject) => {
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
          resolve({
            fileUrl: `file://${filePath}`,
            size: 0, // will be overwritten after stat
            mimeType,
            fileName,
          });
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

        fileName = info.filename ?? 'upload.bin';
        mimeType = info.mimeType ?? 'application/octet-stream';
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

    // Retrieve actual file size
    const stats = await fs.stat(parsed.fileUrl.replace('file://', ''));
    const fileSize = stats.size;

    // Schedule cleanup of the temporary directory
    setTimeout(() => {
      fs.rm(tempDir!, { recursive: true, force: true }).catch(() => {});
    }, UPLOAD_TEMP_TTL_MS).unref?.();

    // Consistent success JSON
    return NextResponse.json({
      success: true,
      data: {
        fileUrl: parsed.fileUrl,
        size: fileSize,
        mimeType: parsed.mimeType,
        fileName: parsed.fileName,
      },
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    // Cleanup temp directory if it exists
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    // Determine appropriate status code
    const validationErrors = [
      'Unsupported file type',
      'File exceeds maximum allowed size',
      'No file uploaded',
    ];
    const isValidation = validationErrors.some((msg) =>
      error.message?.startsWith(msg),
    );
    const status = isValidation ? 400 : 500;

    // Consistent error JSON
    const errorPayload: ErrorResult = {
      error: error.message ?? 'Upload failed',
    };
    return NextResponse.json(
      { success: false, error: errorPayload },
      { status },
    );
  }
}