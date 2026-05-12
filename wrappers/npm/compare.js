#!/usr/bin/env node
'use strict';

/**
 * ipaShip Binary Compare CLI
 * Usage: ipaship compare --file <path1> --file <path2> [--format json|text] [--output <file>]
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');

// ─── Utilities ───────────────────────────────────────────────────────────────

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isArchive(filePath) {
  return ['.ipa', '.apk', '.zip', '.jar', '.aab'].includes(path.extname(filePath).toLowerCase());
}

function fmtBytes(n) {
  if (Math.abs(n) < 1024) return `${n} B`;
  if (Math.abs(n) < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

function fmtSign(n) {
  return n > 0 ? `+${fmtBytes(n)}` : fmtBytes(n);
}

// ─── Archive Listing ─────────────────────────────────────────────────────────

function listArchive(filePath) {
  const r = spawnSync('unzip', ['-v', filePath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return [];

  const entries = [];
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+([0-9a-fA-F]{8})\s+(.+)$/);
    if (!m) continue;
    const p = m[5].trim();
    if (p.endsWith('/')) continue;
    entries.push({ path: p, uncompressedSize: +m[1], compressedSize: +m[3], method: m[2], crc32: m[4].toLowerCase() });
  }
  return entries;
}

// ─── Binary Diff ─────────────────────────────────────────────────────────────

function binaryDiff(f1, f2) {
  const b1 = fs.readFileSync(f1);
  const b2 = fs.readFileSync(f2);
  const identical = b1.equals(b2);

  if (identical) {
    return { file1Size: b1.length, file2Size: b2.length, sizeDelta: 0, sizeDeltaPercent: 0, similarity: 100, totalBytesCompared: b1.length, diffBytes: 0, diffRegions: [], isIdentical: true };
  }

  const MAX = 10 * 1024 * 1024;
  const len = Math.min(b1.length, b2.length, MAX);
  let diffBytes = 0;
  const regions = [];
  let inDiff = false, start = 0;

  for (let i = 0; i < len; i++) {
    if (b1[i] !== b2[i]) {
      diffBytes++;
      if (!inDiff) { inDiff = true; start = i; }
    } else if (inDiff) {
      inDiff = false;
      if (regions.length < 100) regions.push({ offset: start, length: i - start, hexOffset: `0x${start.toString(16).toUpperCase()}` });
    }
  }
  if (inDiff && regions.length < 100) regions.push({ offset: start, length: len - start, hexOffset: `0x${start.toString(16).toUpperCase()}` });

  const similarity = len > 0 ? Math.round(((len - diffBytes) / len) * 10000) / 100 : 0;
  const sizeDelta = b2.length - b1.length;
  return {
    file1Size: b1.length, file2Size: b2.length,
    sizeDelta, sizeDeltaPercent: b1.length > 0 ? Math.round((sizeDelta / b1.length) * 10000) / 100 : 0,
    similarity, totalBytesCompared: len, diffBytes, diffRegions: regions, isIdentical: false,
  };
}

// ─── Archive Diff ────────────────────────────────────────────────────────────

function diffArchives(entries1, entries2) {
  const m1 = new Map(entries1.map(e => [e.path, e]));
  const m2 = new Map(entries2.map(e => [e.path, e]));
  const changes = [];
  let added = 0, removed = 0, modified = 0, unchanged = 0;

  for (const [p, e] of m2) {
    if (!m1.has(p)) { changes.push({ path: p, changeType: 'added', after: e, sizeDelta: e.uncompressedSize, crcChanged: true }); added++; }
  }
  for (const [p, e] of m1) {
    if (!m2.has(p)) { changes.push({ path: p, changeType: 'removed', before: e, sizeDelta: -e.uncompressedSize, crcChanged: true }); removed++; }
  }
  for (const [p, e1] of m1) {
    const e2 = m2.get(p);
    if (!e2) continue;
    if (e1.crc32 !== e2.crc32 || e1.uncompressedSize !== e2.uncompressedSize) {
      changes.push({ path: p, changeType: 'modified', before: e1, after: e2, sizeDelta: e2.uncompressedSize - e1.uncompressedSize, crcChanged: e1.crc32 !== e2.crc32 });
      modified++;
    } else {
      changes.push({ path: p, changeType: 'unchanged', before: e1, after: e2, sizeDelta: 0, crcChanged: false });
      unchanged++;
    }
  }

  const order = { added: 0, removed: 1, modified: 2, unchanged: 3 };
  changes.sort((a, b) => order[a.changeType] - order[b.changeType]);
  return { changes, added, removed, modified, unchanged };
}

// ─── Knowledge Graph ─────────────────────────────────────────────────────────

function buildKnowledgeGraph(summary, fileChanges, diff) {
  const nodes = [], edges = [];
  const seenModules = new Set();

  nodes.push(
    { id: 'v1', label: summary.file1Name, type: 'version', group: 'v1', properties: { path: summary.file1Path, size: summary.file1Size, hash: summary.file1Hash.slice(0, 8) } },
    { id: 'v2', label: summary.file2Name, type: 'version', group: 'v2', properties: { path: summary.file2Path, size: summary.file2Size, hash: summary.file2Hash.slice(0, 8) } },
    { id: 'metric', label: 'Metrics', type: 'metric', group: 'metric', properties: { similarity: `${diff.similarity}%`, sizeDelta: diff.sizeDelta, added: summary.added, removed: summary.removed, modified: summary.modified } },
  );

  edges.push(
    { id: 'e:v1-v2', source: 'v1', target: 'v2', relation: 'changed_to', weight: diff.similarity / 100 },
    { id: 'e:v1-m', source: 'v1', target: 'metric', relation: 'has_metric' },
    { id: 'e:v2-m', source: 'v2', target: 'metric', relation: 'has_metric' },
  );

  const significant = fileChanges.filter(c => c.changeType !== 'unchanged').slice(0, 100);
  for (const c of significant) {
    const nid = `file:${c.path}`;
    nodes.push({ id: nid, label: c.path.split('/').pop() || c.path, type: 'file', group: c.changeType, properties: { path: c.path, changeType: c.changeType, sizeDelta: c.sizeDelta } });
    const src = c.changeType === 'added' ? 'v2' : 'v1';
    const rel = c.changeType === 'added' ? 'added_in' : c.changeType === 'removed' ? 'removed_in' : 'modified_in';
    edges.push({ id: `e:${c.changeType}:${c.path}`, source: src, target: nid, relation: rel });
    const parts = c.path.split('/');
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join('/');
      const mid = `module:${dir}`;
      if (!seenModules.has(mid)) { seenModules.add(mid); nodes.push({ id: mid, label: dir, type: 'module', group: 'module', properties: { directory: dir } }); }
      edges.push({ id: `e:mod:${c.path}`, source: mid, target: nid, relation: 'belongs_to' });
    }
  }

  return { nodes, edges, metadata: { totalNodes: nodes.length, totalEdges: edges.length, generatedAt: new Date().toISOString() } };
}

// ─── Text Renderer ───────────────────────────────────────────────────────────

function renderText(result) {
  const { summary: s, binaryDiff: d, fileChanges, knowledgeGraph: kg } = result;
  const line = '─'.repeat(60);
  const lines = [
    '',
    '  ipaShip Binary Compare',
    line,
    `  File 1 : ${s.file1Name}  (${fmtBytes(s.file1Size)})`,
    `  File 2 : ${s.file2Name}  (${fmtBytes(s.file2Size)})`,
    `  Delta  : ${fmtSign(s.sizeDelta)} (${s.sizeDeltaPercent > 0 ? '+' : ''}${s.sizeDeltaPercent}%)`,
    line,
    `  Identical  : ${s.isIdentical ? 'YES' : 'NO'}`,
    `  Similarity : ${d.similarity}%`,
    `  Bytes diff : ${d.diffBytes.toLocaleString()} / ${d.totalBytesCompared.toLocaleString()} compared`,
    `  Diff regions (capped at 100): ${d.diffRegions.length}`,
    '',
  ];

  if (s.isArchive) {
    lines.push(
      `  Archive Contents`,
      line,
      `  Files in v1 : ${s.totalFiles1}`,
      `  Files in v2 : ${s.totalFiles2}`,
      `  Added       : ${s.added}`,
      `  Removed     : ${s.removed}`,
      `  Modified    : ${s.modified}`,
      `  Unchanged   : ${s.unchanged}`,
      '',
    );

    const relevant = fileChanges.filter(c => c.changeType !== 'unchanged');
    if (relevant.length > 0) {
      lines.push(`  Changed Files (${relevant.length})`, line);
      for (const c of relevant.slice(0, 200)) {
        const icon = c.changeType === 'added' ? '[+]' : c.changeType === 'removed' ? '[-]' : '[~]';
        const delta = c.sizeDelta !== 0 ? `  ${fmtSign(c.sizeDelta)}` : '';
        lines.push(`  ${icon} ${c.path}${delta}`);
      }
      if (relevant.length > 200) lines.push(`  ... and ${relevant.length - 200} more`);
      lines.push('');
    }
  }

  lines.push(
    `  Knowledge Graph`,
    line,
    `  Nodes : ${kg.nodes.length}  (versions, files, modules, metrics)`,
    `  Edges : ${kg.edges.length}  (relationships)`,
    '',
    `  Generated : ${result.generatedAt}`,
    '',
  );

  return lines.join('\n');
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const files = [];
  let format = 'text';
  let output = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'compare') continue;
    if (args[i] === '--file' && args[i + 1]) { files.push(args[++i]); continue; }
    if (args[i] === '--format' && args[i + 1]) { format = args[++i]; continue; }
    if (args[i] === '--output' && args[i + 1]) { output = args[++i]; continue; }
    if (args[i] === '--help' || args[i] === '-h') return { help: true };
  }
  return { files, format, output };
}

function printHelp() {
  console.log(`
  ipaShip Binary Compare

  Usage:
    ipaship compare --file <path1> --file <path2> [options]

  Options:
    --file <path>      File to compare (provide twice)
    --format text|json Output format (default: text)
    --output <file>    Write result to file instead of stdout
    --help             Show this help

  Examples:
    ipaship compare --file app-1.0.0.ipa --file app-1.0.1.ipa
    ipaship compare --file v1.apk --file v2.apk --format json --output diff.json
`);
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) { printHelp(); process.exit(0); }

  const { files, format, output } = opts;

  if (!files || files.length < 2) {
    console.error('Error: provide exactly two --file arguments.\nRun with --help for usage.');
    process.exit(1);
  }

  const [f1, f2] = files;

  for (const f of [f1, f2]) {
    if (!fs.existsSync(f)) { console.error(`Error: file not found: ${f}`); process.exit(1); }
  }

  try {
    const file1Stat = fs.statSync(f1);
    const file2Stat = fs.statSync(f2);
    const file1Hash = hashFile(f1);
    const file2Hash = hashFile(f2);
    const archiveMode = isArchive(f1) || isArchive(f2);
    const diff = binaryDiff(f1, f2);

    let added = 0, removed = 0, modified = 0, unchanged = 0, fileChanges = [];
    if (archiveMode) {
      const e1 = listArchive(f1);
      const e2 = listArchive(f2);
      ({ changes: fileChanges, added, removed, modified, unchanged } = diffArchives(e1, e2));
    }

    const summary = {
      file1Path: f1, file2Path: f2,
      file1Name: path.basename(f1), file2Name: path.basename(f2),
      file1Size: file1Stat.size, file2Size: file2Stat.size,
      file1Hash, file2Hash,
      isIdentical: file1Hash === file2Hash,
      isArchive: archiveMode,
      added, removed, modified, unchanged,
      totalFiles1: removed + modified + unchanged,
      totalFiles2: added + modified + unchanged,
      sizeDelta: file2Stat.size - file1Stat.size,
      sizeDeltaPercent: file1Stat.size > 0 ? Math.round(((file2Stat.size - file1Stat.size) / file1Stat.size) * 10000) / 100 : 0,
    };

    const knowledgeGraph = buildKnowledgeGraph(summary, fileChanges, diff);
    const result = { summary, binaryDiff: diff, fileChanges, knowledgeGraph, generatedAt: new Date().toISOString() };

    const rendered = format === 'json' ? JSON.stringify(result, null, 2) : renderText(result);

    if (output) {
      fs.writeFileSync(output, rendered, 'utf8');
      console.log(`Result written to ${output}`);
    } else {
      console.log(rendered);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
