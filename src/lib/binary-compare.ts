import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { buildKnowledgeGraph, KnowledgeGraph } from './knowledge-graph';

export type FileType = 'binary' | 'text' | 'resource' | 'metadata' | 'archive';
export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface ArchiveEntry {
  path: string;
  uncompressedSize: number;
  compressedSize: number;
  crc32: string;
  method: string;
}

export interface FileChange {
  path: string;
  changeType: ChangeType;
  before?: ArchiveEntry;
  after?: ArchiveEntry;
  sizeDelta: number;
  crcChanged: boolean;
}

export interface DiffRegion {
  offset: number;
  length: number;
  type: 'modified';
  hexOffset: string;
}

export interface BinaryDiff {
  file1Size: number;
  file2Size: number;
  sizeDelta: number;
  sizeDeltaPercent: number;
  similarity: number;
  totalBytesCompared: number;
  diffBytes: number;
  diffRegions: DiffRegion[];
  isIdentical: boolean;
}

export interface ComparisonSummary {
  file1Path: string;
  file2Path: string;
  file1Name: string;
  file2Name: string;
  file1Size: number;
  file2Size: number;
  file1Hash: string;
  file2Hash: string;
  isIdentical: boolean;
  isArchive: boolean;
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  totalFiles1: number;
  totalFiles2: number;
  sizeDelta: number;
  sizeDeltaPercent: number;
}

export interface CompareResult {
  summary: ComparisonSummary;
  binaryDiff: BinaryDiff;
  fileChanges: FileChange[];
  knowledgeGraph: KnowledgeGraph;
  generatedAt: string;
}

const ARCHIVE_EXTENSIONS = new Set(['.ipa', '.apk', '.zip', '.jar', '.aab', '.xcarchive']);
const MAX_BINARY_COMPARE_BYTES = 10 * 1024 * 1024; // 10 MB cap for byte-level scan
const MAX_DIFF_REGIONS = 100;

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isArchiveFile(filePath: string): boolean {
  return ARCHIVE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function listArchiveEntries(filePath: string): ArchiveEntry[] {
  // unzip -v prints: Length  Method  Size  Cmpr  Date  Time  CRC-32  Name
  const result = spawnSync('unzip', ['-v', filePath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) return [];

  const entries: ArchiveEntry[] = [];
  const lines = result.stdout.split('\n');

  for (const line of lines) {
    // Match lines like: "  12345  Defl:N   6789  45%  2024-01-01 12:00  abcdef01  path/to/file"
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+([0-9a-fA-F]{8})\s+(.+)$/);
    if (!m) continue;
    const entryPath = m[5].trim();
    if (entryPath.endsWith('/')) continue; // skip directories
    entries.push({
      path: entryPath,
      uncompressedSize: parseInt(m[1], 10),
      compressedSize: parseInt(m[3], 10),
      method: m[2],
      crc32: m[4].toLowerCase(),
    });
  }
  return entries;
}

function computeBinaryDiff(file1Path: string, file2Path: string): BinaryDiff {
  const buf1 = fs.readFileSync(file1Path);
  const buf2 = fs.readFileSync(file2Path);
  const file1Size = buf1.length;
  const file2Size = buf2.length;
  const sizeDelta = file2Size - file1Size;
  const sizeDeltaPercent = file1Size > 0 ? (sizeDelta / file1Size) * 100 : 0;
  const isIdentical = buf1.equals(buf2);

  if (isIdentical) {
    return { file1Size, file2Size, sizeDelta: 0, sizeDeltaPercent: 0, similarity: 100, totalBytesCompared: file1Size, diffBytes: 0, diffRegions: [], isIdentical: true };
  }

  const compareLen = Math.min(buf1.length, buf2.length, MAX_BINARY_COMPARE_BYTES);
  let diffBytes = 0;
  const diffRegions: DiffRegion[] = [];
  let inDiff = false;
  let diffStart = 0;

  for (let i = 0; i < compareLen; i++) {
    if (buf1[i] !== buf2[i]) {
      diffBytes++;
      if (!inDiff) { inDiff = true; diffStart = i; }
    } else if (inDiff) {
      inDiff = false;
      if (diffRegions.length < MAX_DIFF_REGIONS) {
        diffRegions.push({ offset: diffStart, length: i - diffStart, type: 'modified', hexOffset: `0x${diffStart.toString(16).toUpperCase()}` });
      }
    }
  }
  if (inDiff && diffRegions.length < MAX_DIFF_REGIONS) {
    diffRegions.push({ offset: diffStart, length: compareLen - diffStart, type: 'modified', hexOffset: `0x${diffStart.toString(16).toUpperCase()}` });
  }

  const similarity = compareLen > 0 ? Math.round(((compareLen - diffBytes) / compareLen) * 10000) / 100 : 0;

  return { file1Size, file2Size, sizeDelta, sizeDeltaPercent: Math.round(sizeDeltaPercent * 100) / 100, similarity, totalBytesCompared: compareLen, diffBytes, diffRegions, isIdentical: false };
}

function diffArchiveEntries(entries1: ArchiveEntry[], entries2: ArchiveEntry[]): { changes: FileChange[]; added: number; removed: number; modified: number; unchanged: number } {
  const map1 = new Map(entries1.map(e => [e.path, e]));
  const map2 = new Map(entries2.map(e => [e.path, e]));
  const changes: FileChange[] = [];
  let added = 0, removed = 0, modified = 0, unchanged = 0;

  for (const [p, e] of map2) {
    if (!map1.has(p)) {
      changes.push({ path: p, changeType: 'added', after: e, sizeDelta: e.uncompressedSize, crcChanged: true });
      added++;
    }
  }
  for (const [p, e] of map1) {
    if (!map2.has(p)) {
      changes.push({ path: p, changeType: 'removed', before: e, sizeDelta: -e.uncompressedSize, crcChanged: true });
      removed++;
    }
  }
  for (const [p, e1] of map1) {
    const e2 = map2.get(p);
    if (!e2) continue;
    const crcChanged = e1.crc32 !== e2.crc32;
    if (crcChanged || e1.uncompressedSize !== e2.uncompressedSize) {
      changes.push({ path: p, changeType: 'modified', before: e1, after: e2, sizeDelta: e2.uncompressedSize - e1.uncompressedSize, crcChanged });
      modified++;
    } else {
      changes.push({ path: p, changeType: 'unchanged', before: e1, after: e2, sizeDelta: 0, crcChanged: false });
      unchanged++;
    }
  }

  changes.sort((a, b) => {
    const order: Record<ChangeType, number> = { added: 0, removed: 1, modified: 2, unchanged: 3 };
    return order[a.changeType] - order[b.changeType];
  });

  return { changes, added, removed, modified, unchanged };
}

export async function compareFiles(file1Path: string, file2Path: string): Promise<CompareResult> {
  for (const p of [file1Path, file2Path]) {
    if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`);
    const stat = fs.statSync(p);
    if (!stat.isFile()) throw new Error(`Not a file: ${p}`);
  }

  const file1Stat = fs.statSync(file1Path);
  const file2Stat = fs.statSync(file2Path);
  const file1Hash = hashFile(file1Path);
  const file2Hash = hashFile(file2Path);
  const isIdentical = file1Hash === file2Hash;
  const archiveMode = isArchiveFile(file1Path) || isArchiveFile(file2Path);

  const binaryDiff = computeBinaryDiff(file1Path, file2Path);

  let fileChanges: FileChange[] = [];
  let added = 0, removed = 0, modified = 0, unchanged = 0;

  if (archiveMode) {
    const entries1 = listArchiveEntries(file1Path);
    const entries2 = listArchiveEntries(file2Path);
    ({ changes: fileChanges, added, removed, modified, unchanged } = diffArchiveEntries(entries1, entries2));
  }

  const summary: ComparisonSummary = {
    file1Path,
    file2Path,
    file1Name: path.basename(file1Path),
    file2Name: path.basename(file2Path),
    file1Size: file1Stat.size,
    file2Size: file2Stat.size,
    file1Hash,
    file2Hash,
    isIdentical,
    isArchive: archiveMode,
    added,
    removed,
    modified,
    unchanged,
    totalFiles1: removed + modified + unchanged,
    totalFiles2: added + modified + unchanged,
    sizeDelta: file2Stat.size - file1Stat.size,
    sizeDeltaPercent: file1Stat.size > 0 ? Math.round(((file2Stat.size - file1Stat.size) / file1Stat.size) * 10000) / 100 : 0,
  };

  const knowledgeGraph = buildKnowledgeGraph(summary, fileChanges, binaryDiff);

  return { summary, binaryDiff, fileChanges, knowledgeGraph, generatedAt: new Date().toISOString() };
}
