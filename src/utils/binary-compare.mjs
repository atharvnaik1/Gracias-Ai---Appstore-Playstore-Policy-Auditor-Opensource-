import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const DEFAULT_MAX_RANGES = 200;

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function statPath(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    throw new Error(`Unable to read ${filePath}: ${error.message}`);
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

function pushRange(ranges, start, end, maxRanges) {
  if (start === null || end < start) return;

  const previous = ranges[ranges.length - 1];
  if (previous && previous.end + 1 === start) {
    previous.end = end;
    previous.length = previous.end - previous.start + 1;
    return;
  }

  if (ranges.length < maxRanges) {
    ranges.push({ start, end, length: end - start + 1 });
  }
}

async function readChunk(handle, buffer, position) {
  const result = await handle.read(buffer, 0, buffer.length, position);
  return result.bytesRead;
}

async function compareFileBytes(leftPath, rightPath, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const maxRanges = options.maxRanges || DEFAULT_MAX_RANGES;
  const leftStat = await statPath(leftPath);
  const rightStat = await statPath(rightPath);
  const comparedLength = Math.min(leftStat.size, rightStat.size);
  const ranges = [];
  let differingBytes = 0;
  let currentStart = null;
  let currentEnd = null;
  let leftHandle;
  let rightHandle;

  try {
    leftHandle = await fs.open(leftPath, 'r');
    rightHandle = await fs.open(rightPath, 'r');

    const leftBuffer = Buffer.allocUnsafe(chunkSize);
    const rightBuffer = Buffer.allocUnsafe(chunkSize);
    let position = 0;

    while (position < comparedLength) {
      const bytesToRead = Math.min(chunkSize, comparedLength - position);
      const leftView = leftBuffer.subarray(0, bytesToRead);
      const rightView = rightBuffer.subarray(0, bytesToRead);
      const leftRead = await readChunk(leftHandle, leftView, position);
      const rightRead = await readChunk(rightHandle, rightView, position);
      const readLength = Math.min(leftRead, rightRead);

      for (let index = 0; index < readLength; index += 1) {
        const offset = position + index;
        if (leftView[index] !== rightView[index]) {
          differingBytes += 1;
          if (currentStart === null) currentStart = offset;
          currentEnd = offset;
        } else if (currentStart !== null) {
          pushRange(ranges, currentStart, currentEnd, maxRanges);
          currentStart = null;
          currentEnd = null;
        }
      }

      position += readLength;
    }
  } finally {
    if (leftHandle) await leftHandle.close();
    if (rightHandle) await rightHandle.close();
  }

  if (currentStart !== null) {
    pushRange(ranges, currentStart, currentEnd, maxRanges);
  }

  if (leftStat.size !== rightStat.size) {
    const start = comparedLength;
    const end = Math.max(leftStat.size, rightStat.size) - 1;
    differingBytes += end - start + 1;
    pushRange(ranges, start, end, maxRanges);
  }

  const [leftSha256, rightSha256] = await Promise.all([
    hashFile(leftPath),
    hashFile(rightPath),
  ]);

  return {
    kind: 'file',
    equal: leftSha256 === rightSha256 && leftStat.size === rightStat.size,
    left: { path: leftPath, size: leftStat.size, sha256: leftSha256 },
    right: { path: rightPath, size: rightStat.size, sha256: rightSha256 },
    comparedBytes: comparedLength,
    differingBytes,
    differenceRanges: ranges,
    truncatedRanges: ranges.length >= maxRanges,
  };
}

async function listDirectoryFiles(rootDir) {
  const files = [];

  async function walk(currentDir, relativeDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizeRelativePath(path.join(relativeDir, entry.name));
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absolutePath);
        files.push({
          path: relativePath,
          absolutePath,
          size: stat.size,
          sha256: await hashFile(absolutePath),
        });
      }
    }
  }

  await walk(rootDir, '');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function compareDirectories(leftPath, rightPath) {
  const [leftFiles, rightFiles] = await Promise.all([
    listDirectoryFiles(leftPath),
    listDirectoryFiles(rightPath),
  ]);
  const leftByPath = new Map(leftFiles.map(file => [file.path, file]));
  const rightByPath = new Map(rightFiles.map(file => [file.path, file]));
  const allPaths = Array.from(new Set([...leftByPath.keys(), ...rightByPath.keys()])).sort();
  const changes = [];

  for (const filePath of allPaths) {
    const left = leftByPath.get(filePath);
    const right = rightByPath.get(filePath);
    if (!left) {
      changes.push({ type: 'added', path: filePath, right: { size: right.size, sha256: right.sha256 } });
    } else if (!right) {
      changes.push({ type: 'removed', path: filePath, left: { size: left.size, sha256: left.sha256 } });
    } else if (left.sha256 !== right.sha256 || left.size !== right.size) {
      changes.push({
        type: 'modified',
        path: filePath,
        left: { size: left.size, sha256: left.sha256 },
        right: { size: right.size, sha256: right.sha256 },
      });
    }
  }

  return {
    kind: 'directory',
    equal: changes.length === 0,
    left: { path: leftPath, fileCount: leftFiles.length },
    right: { path: rightPath, fileCount: rightFiles.length },
    changes,
  };
}

function buildKnowledgeGraph(comparison) {
  const nodes = [
    { id: 'left', type: 'artifact', label: comparison.left.path },
    { id: 'right', type: 'artifact', label: comparison.right.path },
  ];
  const edges = [{ from: 'left', to: 'right', type: comparison.equal ? 'matches' : 'differs_from' }];

  if (comparison.kind === 'file') {
    comparison.differenceRanges.forEach((range, index) => {
      const nodeId = `range:${index + 1}`;
      nodes.push({
        id: nodeId,
        type: 'byte_range',
        label: `${range.start}-${range.end}`,
        start: range.start,
        end: range.end,
        length: range.length,
      });
      edges.push({ from: 'left', to: nodeId, type: 'has_difference' });
      edges.push({ from: 'right', to: nodeId, type: 'has_difference' });
    });
  } else {
    comparison.changes.forEach((change, index) => {
      const nodeId = `file:${index + 1}`;
      nodes.push({
        id: nodeId,
        type: 'file_change',
        label: change.path,
        changeType: change.type,
        path: change.path,
      });
      edges.push({ from: 'left', to: nodeId, type: change.type === 'added' ? 'missing' : 'contains' });
      edges.push({ from: 'right', to: nodeId, type: change.type === 'removed' ? 'missing' : 'contains' });
    });
  }

  return { nodes, edges };
}

export async function compareArtifacts(leftPath, rightPath, options = {}) {
  const [leftStat, rightStat] = await Promise.all([statPath(leftPath), statPath(rightPath)]);
  let comparison;

  if (leftStat.isFile() && rightStat.isFile()) {
    comparison = await compareFileBytes(leftPath, rightPath, options);
  } else if (leftStat.isDirectory() && rightStat.isDirectory()) {
    comparison = await compareDirectories(leftPath, rightPath);
  } else {
    throw new Error('Both compare inputs must be the same kind: two files or two directories.');
  }

  return {
    ...comparison,
    generatedAt: new Date().toISOString(),
    knowledgeGraph: buildKnowledgeGraph(comparison),
  };
}
