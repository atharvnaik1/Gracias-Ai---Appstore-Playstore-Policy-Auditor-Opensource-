#!/usr/bin/env python3
"""
ipaShip Binary Compare Module
Compares two binary/archive files (IPA, APK, ZIP, etc.) and produces a
structured diff report with a knowledge graph.

CLI:  python ipaship_compare.py --file path1 --file path2 [--format text|json] [--output file]
API:  from ipaship_compare import compare_files
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ARCHIVE_EXTENSIONS = {".ipa", ".apk", ".zip", ".jar", ".aab", ".xcarchive"}
MAX_BINARY_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_DIFF_REGIONS = 100


# ─── Data Classes ────────────────────────────────────────────────────────────


@dataclass
class ArchiveEntry:
    path: str
    uncompressed_size: int
    compressed_size: int
    crc32: str
    method: str


@dataclass
class DiffRegion:
    offset: int
    length: int
    hex_offset: str


@dataclass
class BinaryDiff:
    file1_size: int
    file2_size: int
    size_delta: int
    size_delta_percent: float
    similarity: float
    total_bytes_compared: int
    diff_bytes: int
    diff_regions: list[DiffRegion]
    is_identical: bool


@dataclass
class FileChange:
    path: str
    change_type: str  # added | removed | modified | unchanged
    size_delta: int
    crc_changed: bool
    before: Optional[ArchiveEntry] = None
    after: Optional[ArchiveEntry] = None


@dataclass
class ComparisonSummary:
    file1_path: str
    file2_path: str
    file1_name: str
    file2_name: str
    file1_size: int
    file2_size: int
    file1_hash: str
    file2_hash: str
    is_identical: bool
    is_archive: bool
    added: int
    removed: int
    modified: int
    unchanged: int
    total_files1: int
    total_files2: int
    size_delta: int
    size_delta_percent: float


@dataclass
class KGNode:
    id: str
    label: str
    type: str
    group: str
    properties: dict = field(default_factory=dict)


@dataclass
class KGEdge:
    id: str
    source: str
    target: str
    relation: str
    weight: Optional[float] = None
    properties: dict = field(default_factory=dict)


@dataclass
class KnowledgeGraph:
    nodes: list[KGNode]
    edges: list[KGEdge]
    metadata: dict = field(default_factory=dict)


@dataclass
class CompareResult:
    summary: ComparisonSummary
    binary_diff: BinaryDiff
    file_changes: list[FileChange]
    knowledge_graph: KnowledgeGraph
    generated_at: str


# ─── Helpers ─────────────────────────────────────────────────────────────────


def hash_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def is_archive(path: str) -> bool:
    return Path(path).suffix.lower() in ARCHIVE_EXTENSIONS


def fmt_bytes(n: int) -> str:
    sign = "+" if n > 0 else ""
    a = abs(n)
    if a < 1024:
        return f"{sign}{n} B"
    if a < 1024**2:
        return f"{sign}{n / 1024:.1f} KB"
    return f"{sign}{n / 1024 ** 2:.2f} MB"


# ─── Archive Listing ─────────────────────────────────────────────────────────


def list_archive(file_path: str) -> list[ArchiveEntry]:
    try:
        result = subprocess.run(
            ["unzip", "-v", file_path],
            capture_output=True, text=True, timeout=60,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    entries: list[ArchiveEntry] = []
    pattern = re.compile(
        r"^\s*(\d+)\s+(\S+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+([0-9a-fA-F]{8})\s+(.+)$"
    )
    for line in result.stdout.splitlines():
        m = pattern.match(line)
        if not m:
            continue
        p = m.group(5).strip()
        if p.endswith("/"):
            continue
        entries.append(ArchiveEntry(
            path=p,
            uncompressed_size=int(m.group(1)),
            compressed_size=int(m.group(3)),
            method=m.group(2),
            crc32=m.group(4).lower(),
        ))
    return entries


# ─── Binary Diff ─────────────────────────────────────────────────────────────


def compute_binary_diff(f1: str, f2: str) -> BinaryDiff:
    data1 = open(f1, "rb").read()
    data2 = open(f2, "rb").read()
    identical = data1 == data2
    size1, size2 = len(data1), len(data2)
    delta = size2 - size1
    delta_pct = round((delta / size1) * 100, 2) if size1 else 0.0

    if identical:
        return BinaryDiff(size1, size2, 0, 0.0, 100.0, size1, 0, [], True)

    compare_len = min(size1, size2, MAX_BINARY_BYTES)
    diff_bytes = 0
    regions: list[DiffRegion] = []
    in_diff = False
    start = 0

    for i in range(compare_len):
        if data1[i] != data2[i]:
            diff_bytes += 1
            if not in_diff:
                in_diff = True
                start = i
        elif in_diff:
            in_diff = False
            if len(regions) < MAX_DIFF_REGIONS:
                regions.append(DiffRegion(start, i - start, f"0x{start:X}"))

    if in_diff and len(regions) < MAX_DIFF_REGIONS:
        regions.append(DiffRegion(start, compare_len - start, f"0x{start:X}"))

    similarity = round(((compare_len - diff_bytes) / compare_len) * 100, 2) if compare_len else 0.0

    return BinaryDiff(size1, size2, delta, delta_pct, similarity, compare_len, diff_bytes, regions, False)


# ─── Archive Diff ─────────────────────────────────────────────────────────────


def diff_archives(entries1: list[ArchiveEntry], entries2: list[ArchiveEntry]):
    map1 = {e.path: e for e in entries1}
    map2 = {e.path: e for e in entries2}
    changes: list[FileChange] = []
    added = removed = modified = unchanged = 0

    for p, e in map2.items():
        if p not in map1:
            changes.append(FileChange(p, "added", e.uncompressed_size, True, after=e))
            added += 1

    for p, e in map1.items():
        if p not in map2:
            changes.append(FileChange(p, "removed", -e.uncompressed_size, True, before=e))
            removed += 1

    for p, e1 in map1.items():
        e2 = map2.get(p)
        if not e2:
            continue
        crc_changed = e1.crc32 != e2.crc32
        if crc_changed or e1.uncompressed_size != e2.uncompressed_size:
            changes.append(FileChange(p, "modified", e2.uncompressed_size - e1.uncompressed_size, crc_changed, e1, e2))
            modified += 1
        else:
            changes.append(FileChange(p, "unchanged", 0, False, e1, e2))
            unchanged += 1

    order = {"added": 0, "removed": 1, "modified": 2, "unchanged": 3}
    changes.sort(key=lambda c: order[c.change_type])
    return changes, added, removed, modified, unchanged


# ─── Knowledge Graph ─────────────────────────────────────────────────────────


def build_knowledge_graph(summary: ComparisonSummary, file_changes: list[FileChange], diff: BinaryDiff) -> KnowledgeGraph:
    nodes: list[KGNode] = []
    edges: list[KGEdge] = []
    seen_modules: set[str] = set()

    nodes += [
        KGNode("v1", summary.file1_name, "version", "v1", {"path": summary.file1_path, "size": summary.file1_size, "hash": summary.file1_hash[:8]}),
        KGNode("v2", summary.file2_name, "version", "v2", {"path": summary.file2_path, "size": summary.file2_size, "hash": summary.file2_hash[:8]}),
        KGNode("metric", "Metrics", "metric", "metric", {"similarity": f"{diff.similarity}%", "size_delta": diff.size_delta, "added": summary.added, "removed": summary.removed, "modified": summary.modified}),
    ]
    edges += [
        KGEdge("e:v1-v2", "v1", "v2", "changed_to", diff.similarity / 100),
        KGEdge("e:v1-m", "v1", "metric", "has_metric"),
        KGEdge("e:v2-m", "v2", "metric", "has_metric"),
    ]

    relation_map = {"added": "added_in", "removed": "removed_in", "modified": "modified_in"}
    significant = [c for c in file_changes if c.change_type != "unchanged"][:100]

    for c in significant:
        nid = f"file:{c.path}"
        label = c.path.split("/")[-1]
        nodes.append(KGNode(nid, label, "file", c.change_type, {"path": c.path, "change_type": c.change_type, "size_delta": c.size_delta}))
        src = "v2" if c.change_type == "added" else "v1"
        rel = relation_map.get(c.change_type, "contains")
        edges.append(KGEdge(f"e:{c.change_type}:{c.path}", src, nid, rel))

        parts = c.path.split("/")
        if len(parts) > 1:
            directory = "/".join(parts[:-1])
            mid = f"module:{directory}"
            if mid not in seen_modules:
                seen_modules.add(mid)
                nodes.append(KGNode(mid, directory, "module", "module", {"directory": directory}))
            edges.append(KGEdge(f"e:mod:{c.path}", mid, nid, "belongs_to"))

    return KnowledgeGraph(nodes, edges, {"total_nodes": len(nodes), "total_edges": len(edges), "generated_at": datetime.now(timezone.utc).isoformat()})


# ─── Core API ────────────────────────────────────────────────────────────────


def compare_files(file1: str, file2: str) -> CompareResult:
    for f in (file1, file2):
        if not os.path.isfile(f):
            raise FileNotFoundError(f"File not found: {f}")

    size1 = os.path.getsize(file1)
    size2 = os.path.getsize(file2)
    hash1 = hash_file(file1)
    hash2 = hash_file(file2)
    archive_mode = is_archive(file1) or is_archive(file2)
    diff = compute_binary_diff(file1, file2)

    added = removed = modified = unchanged = 0
    file_changes: list[FileChange] = []

    if archive_mode:
        e1 = list_archive(file1)
        e2 = list_archive(file2)
        file_changes, added, removed, modified, unchanged = diff_archives(e1, e2)

    summary = ComparisonSummary(
        file1_path=file1, file2_path=file2,
        file1_name=Path(file1).name, file2_name=Path(file2).name,
        file1_size=size1, file2_size=size2,
        file1_hash=hash1, file2_hash=hash2,
        is_identical=hash1 == hash2,
        is_archive=archive_mode,
        added=added, removed=removed, modified=modified, unchanged=unchanged,
        total_files1=removed + modified + unchanged,
        total_files2=added + modified + unchanged,
        size_delta=size2 - size1,
        size_delta_percent=round(((size2 - size1) / size1) * 100, 2) if size1 else 0.0,
    )

    kg = build_knowledge_graph(summary, file_changes, diff)
    return CompareResult(summary, diff, file_changes, kg, datetime.now(timezone.utc).isoformat())


# ─── Text Renderer ───────────────────────────────────────────────────────────


def render_text(result: CompareResult) -> str:
    s, d, kg = result.summary, result.binary_diff, result.knowledge_graph
    sep = "─" * 60
    out = [
        "",
        "  ipaShip Binary Compare",
        sep,
        f"  File 1 : {s.file1_name}  ({fmt_bytes(s.file1_size)})",
        f"  File 2 : {s.file2_name}  ({fmt_bytes(s.file2_size)})",
        f"  Delta  : {fmt_bytes(s.size_delta)} ({'+' if s.size_delta_percent > 0 else ''}{s.size_delta_percent}%)",
        sep,
        f"  Identical  : {'YES' if s.is_identical else 'NO'}",
        f"  Similarity : {d.similarity}%",
        f"  Bytes diff : {d.diff_bytes:,} / {d.total_bytes_compared:,} compared",
        f"  Diff regions (capped at 100): {len(d.diff_regions)}",
        "",
    ]

    if s.is_archive:
        out += [
            "  Archive Contents",
            sep,
            f"  Files in v1 : {s.total_files1}",
            f"  Files in v2 : {s.total_files2}",
            f"  Added       : {s.added}",
            f"  Removed     : {s.removed}",
            f"  Modified    : {s.modified}",
            f"  Unchanged   : {s.unchanged}",
            "",
        ]
        relevant = [c for c in result.file_changes if c.change_type != "unchanged"]
        if relevant:
            out.append(f"  Changed Files ({len(relevant)})")
            out.append(sep)
            icons = {"added": "[+]", "removed": "[-]", "modified": "[~]"}
            for c in relevant[:200]:
                delta = f"  {fmt_bytes(c.size_delta)}" if c.size_delta else ""
                out.append(f"  {icons[c.change_type]} {c.path}{delta}")
            if len(relevant) > 200:
                out.append(f"  ... and {len(relevant) - 200} more")
            out.append("")

    out += [
        "  Knowledge Graph",
        sep,
        f"  Nodes : {len(kg.nodes)}  (versions, files, modules, metrics)",
        f"  Edges : {len(kg.edges)}  (relationships)",
        "",
        f"  Generated : {result.generated_at}",
        "",
    ]
    return "\n".join(out)


# ─── Serialization ───────────────────────────────────────────────────────────


def result_to_dict(result: CompareResult) -> dict:
    def convert(obj):
        if hasattr(obj, "__dataclass_fields__"):
            return {k: convert(v) for k, v in asdict(obj).items()}
        if isinstance(obj, list):
            return [convert(i) for i in obj]
        return obj
    return convert(result)


# ─── CLI ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        prog="ipaship compare",
        description="ipaShip Binary Compare — compare two IPA/APK/binary files",
    )
    parser.add_argument("--file", dest="files", action="append", required=True, metavar="PATH",
                        help="File path (provide twice)")
    parser.add_argument("--format", choices=["text", "json"], default="text",
                        help="Output format (default: text)")
    parser.add_argument("--output", metavar="FILE",
                        help="Write output to file instead of stdout")
    args = parser.parse_args()

    if len(args.files) < 2:
        parser.error("Provide --file twice: --file path1 --file path2")

    try:
        result = compare_files(args.files[0], args.files[1])
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    rendered = json.dumps(result_to_dict(result), indent=2) if args.format == "json" else render_text(result)

    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
        print(f"Result written to {args.output}")
    else:
        print(rendered)


if __name__ == "__main__":
    main()
