typescript
// src/app/api/audit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { Readable } from 'stream';
import Busboy from 'busboy';
import { LRUCache } from 'lru-cache';
import { buildRetrievedContext, type SourceFile } from '../../../utils/audit-retrieval';

const execFileAsync = promisify(execFile);

// ────────────────────── Rate limiting ───────────────────────────────────────
const rateLimitCache = new LRUCache<string, number>({
  max: 500,
  ttl: 1000 * 60, // 1 minute
});
const MAX_REQUESTS_PER_MINUTE = 30;

// ────────────────────── Runtime configuration ───────────────────────────────────────
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// ────────────────────── Upload limits ───────────────────────────────────────
const MAX_UPLOAD_SIZE = 150 * 1024 * 1024; // 150 MB
const MAX_FILE_SIZE = 50_000; // 50 KB per source file
const MAX_TOTAL_CONTENT = 350_000; // 350 KB total context

// ────────────────────── Allowed extensions & directories ───────────────────────
const RELEVANT_EXTENSIONS = new Set([
  '.swift', '.dart', '.m', '.h', '.mm', '.plist', '.storyboard', '.xib',
  '.pbxproj', '.entitlements', '.json', '.xml', '.yaml', '.yml', '.md',
  '.txt', '.strings', '.xcprivacy', '.js', '.ts', '.tsx', '.jsx', '.java',
  '.kt', '.gradle', '.pro', '.properties', '.html', '.css',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'Pods', 'build', 'DerivedData', '.build',
  '.swiftpm', 'Carthage', 'vendor', '__pycache__', '.dart_tool',
  'Frameworks', 'PlugIns', '_CodeSignature', 'SC_Info', 'Assets.car',
  'Base.lproj', 'META-INF', 'assets', 'res/raw',
]);

// ────────────────────── Helper: client identifier ───────────────────────
function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return `ip:${ip}`;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return `ip:${realIp.trim()}`;
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return `ip:${cfIp.trim()}`;
  const ua = (req.headers.get('user-agent') || 'unknown-ua').slice(0, 120);
  const lang = (req.headers.get('accept-language') || 'unknown-lang').slice(0, 40);
  return `fp:${ua}|${lang}`;
}

// ────────────────────── Types ───────────────────────────────────────
interface ParsedUpload {
  filePath: string;
  fileName: string;
  apiKey: string;
  provider: string;
  model: string;
  context: string;
  fileId?: string;
}

// ────────────────────── Multipart parser ───────────────────────────────────────
function parseMultipartStream(req: NextRequest, tempDir: string): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') ?? '';
    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 },
    });

    let filePath = '';
    let fileName = '';
    let apiKey = '';
    let provider = 'anthropic';
    let model = '';
    let context = '';
    let fileId = '';
    let fileReceived = false;
    let totalBytes = 0;
    let rejected = false;
    let writeFinished = false;
    let busboyFinished = false;

    const safeReject = (err: Error) => {
      if (!rejected) {
        rejected = true;
        reject(err);
      }
    };

    const tryResolve = () => {
      if (busboyFinished && writeFinished && !rejected) {
        resolve({ filePath, fileName, apiKey, provider, model, context, fileId });
      }
    };

    busboy.on('file', (fieldname, fileStream, info) => {
      if (fieldname !== 'file') {
        (fileStream as any).resume();
        return;
      }

      fileName = info.filename ?? 'upload.ipa';
      filePath = path.join(tempDir, fileName);
      fileReceived = true;

      const writeStream = createWriteStream(filePath);

      fileStream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_UPLOAD_SIZE) {
          (fileStream as any).unpipe(writeStream);
          writeStream.destroy();
          (fileStream as any).resume();
          safeReject(new Error(`File exceeds maximum size of ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB`));
        }
      });

      (fileStream as NodeJS.ReadableStream).pipe(writeStream);

      writeStream.on('finish', () => {
        writeFinished = true;
        tryResolve();
      });

      writeStream.on('error', (err: Error) => {
        safeReject(new Error(`Failed to write file to disk: ${err.message}`));
      });

      (fileStream as any).on('limit', () => {
        (fileStream as any).unpipe(writeStream);
        writeStream.destroy();
        (fileStream as any).resume();
        safeReject(new Error(`File exceeds maximum size of ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB`));
      });
    });

    busboy.on('field', (fieldname, val) => {
      switch (fieldname) {
        case 'claudeApiKey':
        case 'apiKey':
          apiKey = val;
          break;
        case 'provider':
          provider = val;
          break;
        case 'model':
          model = val;
          break;
        case 'context':
          context = val;
          break;
        case 'fileId':
          fileId = val;
          break;
        case 'fileName':
          fileName = val;
          break;
      }
    });

    busboy.on('finish', () => {
      if (!fileReceived && !fileId) {
        safeReject(new Error('No file uploaded'));
        return;
      }
      if (!fileReceived && fileId) {
        filePath = path.join(os.tmpdir(), fileId, fileName);
        fileReceived = true;
        writeFinished = true;
      }
      busboyFinished = true;
      if (!filePath) {
        safeReject(new Error('File path could not be resolved'));
        return;
      }
      tryResolve();
    });

    busboy.on('error', (err: Error) => {
      safeReject(new Error(`Upload parsing failed: ${err.message}`));
    });

    // Convert Web ReadableStream to Node.js Readable
    const reader = req.body!.getReader();
    const nodeStream = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) this.push(null);
          else this.push(Buffer.from(value));
        } catch (err) {
          this.destroy(err as Error);
        }
      },
    });

    nodeStream.pipe(busboy);
  });
}

// ────────────────────── File collector ───────────────────────────────────────
async function collectFiles(dir: string, basePath: string = ''): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  let totalSize = 0;

  async function walk(currentDir: string, relativePath: string) {
    if (totalSize > MAX_TOTAL_CONTENT) return;

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (totalSize > MAX_TOTAL_CONTENT) break;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!RELEVANT_EXTENSIONS.has(ext)) continue;

        try {
          const stat = await fs.stat(fullPath);
          if (stat.size > MAX_FILE_SIZE) continue;
          const content = await fs.readFile(fullPath, 'utf8');
          totalSize += content.length;
          files.push({ path: relPath, content });
        } catch {
          // silently ignore unreadable files
        }
      }
    }
  }

  await walk(dir);
  return files;
}

// ────────────────────── API handler ───────────────────────────────────────
export async function POST(req: NextRequest) {
  // Rate limiting
  const clientKey = getClientKey(req);
  const currentCount = rateLimitCache.get(clientKey) ?? 0;
  if (currentCount >= MAX_REQUESTS_PER_MINUTE) {
    return NextResponse.json(
      { error: 'Too many requests - rate limit exceeded' },
      { status: 429 }
    );
  }
  rateLimitCache.set(clientKey, currentCount + 1);

  // Create a temporary directory for the upload
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-'));

  try {
    const upload = await parseMultipartStream(req, tempDir);

    // Validate required fields
    const missingFields: string[] = [];
    if (!upload.apiKey) missingFields.push('apiKey');
    if (!upload.model) missingFields.push('model');
    if (!upload.provider) missingFields.push('provider');
    if (!upload.filePath && !upload.fileId) missingFields.push('file');

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required field(s): ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Example processing – collect source files if a directory was provided
    // (In a real implementation you would handle the uploaded file accordingly)
    let sourceFiles: SourceFile[] = [];
    try {
      const stats = await fs.stat(upload.filePath);
      if (stats.isDirectory()) {
        sourceFiles = await collectFiles(upload.filePath);
      }
    } catch {
      // If the path is not a directory, we skip file collection
    }

    // Build the context (placeholder – replace with real logic)
    const contextResult = await buildRetrievedContext({
      apiKey: upload.apiKey,
      provider: upload.provider,
      model: upload.model,
      context: upload.context,
      files: sourceFiles,
    });

    // Clean up temporary directory
    await fs.rmdir(tempDir, { recursive: true });

    return NextResponse.json(
      { success: true, result: contextResult },
      { status: 200 }
    );
  } catch (err: any) {
    // Clean up temporary directory on error
    await fs.rmdir(tempDir, { recursive: true });
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 400 }
    );
  }
}