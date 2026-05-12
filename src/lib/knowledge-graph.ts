import type { ComparisonSummary, FileChange, BinaryDiff, ChangeType } from './binary-compare';

export interface KGNode {
  id: string;
  label: string;
  type: 'version' | 'file' | 'module' | 'metric';
  group: string;
  properties: Record<string, unknown>;
}

export interface KGEdge {
  id: string;
  source: string;
  target: string;
  relation: 'changed_to' | 'contains' | 'added_in' | 'removed_in' | 'modified_in' | 'has_metric' | 'belongs_to';
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface KnowledgeGraph {
  nodes: KGNode[];
  edges: KGEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    changeBreakdown: Record<ChangeType, number>;
    generatedAt: string;
  };
}

export function buildKnowledgeGraph(
  summary: ComparisonSummary,
  fileChanges: FileChange[],
  binaryDiff: BinaryDiff,
): KnowledgeGraph {
  const nodes: KGNode[] = [];
  const edges: KGEdge[] = [];
  const seenModules = new Set<string>();

  const v1Id = 'version:file1';
  const v2Id = 'version:file2';
  const metricId = 'metric:comparison';

  nodes.push(
    {
      id: v1Id,
      label: summary.file1Name,
      type: 'version',
      group: 'v1',
      properties: { path: summary.file1Path, size: summary.file1Size, hash: summary.file1Hash.slice(0, 8) },
    },
    {
      id: v2Id,
      label: summary.file2Name,
      type: 'version',
      group: 'v2',
      properties: { path: summary.file2Path, size: summary.file2Size, hash: summary.file2Hash.slice(0, 8) },
    },
    {
      id: metricId,
      label: 'Comparison Metrics',
      type: 'metric',
      group: 'metric',
      properties: {
        similarity: `${binaryDiff.similarity}%`,
        sizeDelta: binaryDiff.sizeDelta,
        sizeDeltaPercent: `${summary.sizeDeltaPercent}%`,
        isIdentical: summary.isIdentical,
        added: summary.added,
        removed: summary.removed,
        modified: summary.modified,
        unchanged: summary.unchanged,
        diffRegions: binaryDiff.diffRegions.length,
      },
    },
  );

  edges.push(
    { id: 'e:v1-v2', source: v1Id, target: v2Id, relation: 'changed_to', weight: binaryDiff.similarity / 100, properties: { similarity: binaryDiff.similarity } },
    { id: 'e:v1-metric', source: v1Id, target: metricId, relation: 'has_metric' },
    { id: 'e:v2-metric', source: v2Id, target: metricId, relation: 'has_metric' },
  );

  // Only include meaningful (non-unchanged) file nodes, capped at 100 to keep graph manageable
  const significant = fileChanges.filter(c => c.changeType !== 'unchanged').slice(0, 100);

  for (const change of significant) {
    const nodeId = `file:${change.path}`;
    const label = change.path.split('/').pop() ?? change.path;

    nodes.push({
      id: nodeId,
      label,
      type: 'file',
      group: change.changeType,
      properties: {
        path: change.path,
        changeType: change.changeType,
        sizeDelta: change.sizeDelta,
        beforeSize: change.before?.uncompressedSize,
        afterSize: change.after?.uncompressedSize,
        crcChanged: change.crcChanged,
      },
    });

    const relationMap: Record<string, KGEdge['relation']> = {
      added: 'added_in',
      removed: 'removed_in',
      modified: 'modified_in',
    };

    const vSource = change.changeType === 'added' ? v2Id : v1Id;
    edges.push({ id: `e:${change.changeType}:${change.path}`, source: vSource, target: nodeId, relation: relationMap[change.changeType] ?? 'contains' });

    // Module grouping by directory
    const parts = change.path.split('/');
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join('/');
      const moduleId = `module:${dir}`;
      if (!seenModules.has(moduleId)) {
        seenModules.add(moduleId);
        nodes.push({ id: moduleId, label: dir, type: 'module', group: 'module', properties: { directory: dir } });
      }
      edges.push({ id: `e:mod:${change.path}`, source: moduleId, target: nodeId, relation: 'belongs_to' });
    }
  }

  const changeBreakdown: Record<ChangeType, number> = {
    added: summary.added,
    removed: summary.removed,
    modified: summary.modified,
    unchanged: summary.unchanged,
  };

  return {
    nodes,
    edges,
    metadata: { totalNodes: nodes.length, totalEdges: edges.length, changeBreakdown, generatedAt: new Date().toISOString() },
  };
}
