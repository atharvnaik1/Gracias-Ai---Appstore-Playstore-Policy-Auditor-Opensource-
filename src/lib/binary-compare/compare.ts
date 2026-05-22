export interface BinaryDiffResult {
  file: string;
  sizeV1: number;
  sizeV2: number;
  sizeDiff: number;
  sizeDiffPercent: number;
  hashV1: string;
  hashV2: string;
  hashMatch: boolean;
  added: boolean;
  removed: boolean;
  modified: boolean;
}

export interface BinaryCompareReport {
  version1: string;
  version2: string;
  timestamp: string;
  totalFiles: number;
  addedFiles: number;
  removedFiles: number;
  modifiedFiles: number;
  unchangedFiles: number;
  diffs: BinaryDiffResult[];
  knowledgeGraph: KnowledgeGraphNode[];
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: "added" | "removed" | "modified" | "unchanged" | "category";
  metadata?: Record<string, string | number>;
  connections: string[];
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function hashBuffer(buf: Buffer): string {
  const hash = crc32(buf);
  return hash.toString(16).padStart(8, "0");
}

function categorizeFile(filename: string): string {
  if (filename.endsWith(".dylib") || filename.endsWith(".so") || filename.endsWith(".dll")) return "shared-library";
  if (filename.endsWith(".framework/") || filename.includes(".framework/")) return "framework";
  if (filename.endsWith(".app/") || filename.includes(".app/")) return "app-bundle";
  if (filename.endsWith(".nib") || filename.endsWith(".storyboardc")) return "ui-resource";
  if (filename.endsWith(".plist")) return "configuration";
  if (filename.endsWith(".png") || filename.endsWith(".jpg") || filename.endsWith(".pdf")) return "asset";
  if (filename.endsWith(".strings")) return "localization";
  if (filename.endsWith(".js") || filename.endsWith(".wasm")) return "runtime";
  return "other";
}

export function compareBinaryContents(
  filesV1: Map<string, Buffer>,
  filesV2: Map<string, Buffer>,
  version1: string,
  version2: string
): BinaryCompareReport {
  const diffs: BinaryDiffResult[] = [];
  const knowledgeGraph: KnowledgeGraphNode[] = [];
  const allKeys = new Set([...filesV1.keys(), ...filesV2.keys()]);

  let addedFiles = 0;
  let removedFiles = 0;
  let modifiedFiles = 0;
  let unchangedFiles = 0;

  const categoryNodes = new Map<string, string>();

  for (const file of allKeys) {
    const v1 = filesV1.get(file);
    const v2 = filesV2.get(file);
    const category = categorizeFile(file);

    if (!categoryNodes.has(category)) {
      const nodeId = `cat-${category}`;
      categoryNodes.set(category, nodeId);
      knowledgeGraph.push({ id: nodeId, label: category, type: "category", connections: [] });
    }

    const result: BinaryDiffResult = {
      file,
      sizeV1: v1?.byteLength ?? 0,
      sizeV2: v2?.byteLength ?? 0,
      sizeDiff: 0,
      sizeDiffPercent: 0,
      hashV1: v1 ? hashBuffer(v1) : "",
      hashV2: v2 ? hashBuffer(v2) : "",
      hashMatch: false,
      added: false,
      removed: false,
      modified: false,
    };

    if (v1 && !v2) {
      result.removed = true;
      removedFiles++;
    } else if (!v1 && v2) {
      result.added = true;
      addedFiles++;
    } else if (v1 && v2) {
      result.sizeDiff = Math.abs(v2.byteLength - v1.byteLength);
      result.sizeDiffPercent = v1.byteLength > 0 ? (result.sizeDiff / v1.byteLength) * 100 : 0;
      result.hashMatch = result.hashV1 === result.hashV2;
      if (result.hashMatch) {
        unchangedFiles++;
        result.modified = false;
      } else {
        modifiedFiles++;
        result.modified = true;
      }
    }

    diffs.push(result);

    const nodeId = `file-${file.replace(/[^a-zA-Z0-9]/g, "_")}`;
    knowledgeGraph.push({
      id: nodeId,
      label: file.split("/").pop() || file,
      type: result.added ? "added" : result.removed ? "removed" : result.modified ? "modified" : "unchanged",
      metadata: {
        sizeV1: result.sizeV1,
        sizeV2: result.sizeV2,
        sizeDiff: result.sizeDiff,
        sizeDiffPercent: Math.round(result.sizeDiffPercent * 100) / 100,
        category,
      },
      connections: [categoryNodes.get(category)!],
    });

    const catNode = knowledgeGraph.find(n => n.id === categoryNodes.get(category));
    if (catNode && !catNode.connections.includes(nodeId)) {
      catNode.connections.push(nodeId);
    }
  }

  diffs.sort((a, b) => {
    if (a.added !== b.added) return a.added ? 1 : -1;
    if (a.removed !== b.removed) return a.removed ? -1 : 1;
    if (a.modified !== b.modified) return a.modified ? -1 : 1;
    return b.sizeDiff - a.sizeDiff;
  });

  return {
    version1,
    version2,
    timestamp: new Date().toISOString(),
    totalFiles: allKeys.size,
    addedFiles,
    removedFiles,
    modifiedFiles,
    unchangedFiles,
    diffs,
    knowledgeGraph,
  };
}