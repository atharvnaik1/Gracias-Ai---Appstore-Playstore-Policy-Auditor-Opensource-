#!/usr/bin/env node

const { compareBinaryContents } = require("./compare");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function extractIPA(ipaPath, outputDir) {
  if (!fs.existsSync(ipaPath)) {
    console.error(`Error: File not found: ${ipaPath}`);
    process.exit(1);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    execSync(`unzip -o "${ipaPath}" -d "${outputDir}"`, { stdio: "pipe" });
  } catch {
    console.error(`Error: Failed to extract ${ipaPath}`);
    process.exit(1);
  }
  return outputDir;
}

function collectFiles(dir, prefix = "") {
  const files = new Map();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const subFiles = collectFiles(fullPath, relativePath);
      for (const [name, buf] of subFiles) {
        files.set(name, buf);
      }
    } else {
      try {
        files.set(relativePath, fs.readFileSync(fullPath));
      } catch {}
    }
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: ipaship-compare --file <location1> --file <location2>");
    console.log("");
    console.log("Compare binary contents of two IPA or app versions.");
    console.log("Generates a JSON diff report and knowledge graph.");
    process.exit(1);
  }

  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      files.push(args[i + 1]);
      i++;
    }
  }

  if (files.length !== 2) {
    console.error("Error: Exactly two files required. Use --file <path1> --file <path2>");
    process.exit(1);
  }

  const [file1, file2] = files;

  console.log(`Comparing:\n  v1: ${file1}\n  v2: ${file2}`);

  const tmpDir1 = path.join(require("os").tmpdir(), `ipaship-compare-v1-${Date.now()}`);
  const tmpDir2 = path.join(require("os").tmpdir(), `ipaship-compare-v2-${Date.now()}`);

  console.log("Extracting v1...");
  extractIPA(file1, tmpDir1);
  console.log("Extracting v2...");
  extractIPA(file2, tmpDir2);

  const filesV1 = collectFiles(tmpDir1);
  const filesV2 = collectFiles(tmpDir2);

  console.log(`Found ${filesV1.size} files in v1, ${filesV2.size} files in v2`);

  const report = compareBinaryContents(filesV1, filesV2, path.basename(file1), path.basename(file2));

  console.log("\n--- Binary Compare Report ---");
  console.log(`Total files:   ${report.totalFiles}`);
  console.log(`Added:         ${report.addedFiles}`);
  console.log(`Removed:       ${report.removedFiles}`);
  console.log(`Modified:      ${report.modifiedFiles}`);
  console.log(`Unchanged:     ${report.unchangedFiles}`);
  console.log(`\nKnowledge graph nodes: ${report.knowledgeGraph.length}`);

  if (report.diffs.filter(d => d.modified).length > 0) {
    console.log("\n--- Modified Files (top 10 by size diff) ---");
    report.diffs
      .filter(d => d.modified)
      .sort((a, b) => b.sizeDiff - a.sizeDiff)
      .slice(0, 10)
      .forEach(d => {
        console.log(`  ${d.file}: ${d.sizeV1}B -> ${d.sizeV2}B (${d.sizeDiffPercent > 0 ? "+" : ""}${d.sizeDiffPercent.toFixed(1)}%)`);
      });
  }

  if (report.diffs.filter(d => d.added).length > 0) {
    console.log("\n--- Added Files ---");
    report.diffs.filter(d => d.added).forEach(d => {
      console.log(`  + ${d.file} (${d.sizeV2}B)`);
    });
  }

  if (report.diffs.filter(d => d.removed).length > 0) {
    console.log("\n--- Removed Files ---");
    report.diffs.filter(d => d.removed).forEach(d => {
      console.log(`  - ${d.file} (was ${d.sizeV1}B)`);
    });
  }

  const outputPath = `binary-compare-report-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to: ${outputPath}`);

  require("fs").rmSync(tmpDir1, { recursive: true, force: true });
  require("fs").rmSync(tmpDir2, { recursive: true, force: true });
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});