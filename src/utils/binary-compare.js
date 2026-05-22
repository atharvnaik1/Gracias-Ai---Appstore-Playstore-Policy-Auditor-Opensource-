const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

async function statPath(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Path does not exist: ${targetPath}`);
    }
    throw error;
  }
}

async function hashFile(filePath) {
  const contents = await fs.readFile(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

async function describeFile(filePath, relativePath) {
  const stats = await statPath(filePath);

  return {
    path: relativePath,
    size: stats.size,
    mode: stats.mode,
    mtimeMs: Math.round(stats.mtimeMs),
    sha256: await hashFile(filePath),
  };
}

async function walkDirectory(rootPath, currentPath = rootPath) {
  const entries = await fs.readdir(currentPath, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkDirectory(rootPath, absolutePath));
      continue;
    }

    if (entry.isFile()) {
      const relativePath = path.relative(rootPath, absolutePath).split(path.sep).join('/');
      files.push(await describeFile(absolutePath, relativePath));
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function indexByPath(files) {
  return new Map(files.map((file) => [file.path, file]));
}

async function snapshot(targetPath) {
  const absolutePath = path.resolve(targetPath);
  const stats = await statPath(absolutePath);

  if (stats.isDirectory()) {
    return {
      type: 'directory',
      root: absolutePath,
      files: await walkDirectory(absolutePath),
    };
  }

  if (stats.isFile()) {
    return {
      type: 'file',
      root: path.dirname(absolutePath),
      files: [await describeFile(absolutePath, path.basename(absolutePath))],
    };
  }

  throw new Error(`Only files and directories can be compared: ${targetPath}`);
}

async function comparePaths(leftPath, rightPath) {
  const [left, right] = await Promise.all([snapshot(leftPath), snapshot(rightPath)]);

  if (left.type === 'file' && right.type === 'file') {
    left.files[0].path = 'file';
    right.files[0].path = 'file';
  }

  const leftByPath = indexByPath(left.files);
  const rightByPath = indexByPath(right.files);
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const [filePath, rightFile] of rightByPath) {
    const leftFile = leftByPath.get(filePath);

    if (!leftFile) {
      added.push(rightFile);
      continue;
    }

    if (leftFile.sha256 !== rightFile.sha256 || leftFile.size !== rightFile.size) {
      changed.push({path: filePath, before: leftFile, after: rightFile});
      continue;
    }

    unchanged.push(rightFile);
  }

  for (const [filePath, leftFile] of leftByPath) {
    if (!rightByPath.has(filePath)) {
      removed.push(leftFile);
    }
  }

  return {
    left: {path: path.resolve(leftPath), type: left.type, files: left.files.length},
    right: {path: path.resolve(rightPath), type: right.type, files: right.files.length},
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
    },
    added,
    removed,
    changed,
  };
}

module.exports = {
  comparePaths,
};
