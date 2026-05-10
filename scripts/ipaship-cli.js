#!/usr/bin/env node

const { pathToFileURL } = require('node:url');

function printUsage() {
  console.error(`Usage:
  ipaship compare --file <left> --file <right> [--json]
  ipaship --ipaship compare --file <left> --file <right> [--json]

Options:
  --file <path>       File or directory to compare. Provide exactly two.
  --max-ranges <n>    Maximum byte ranges to include for file diffs. Default: 200.
  --json              Print full JSON, including the knowledge graph.
`);
}

function parseArgs(argv) {
  const args = argv.filter(arg => arg !== '--ipaship');
  const command = args[0];
  const files = [];
  let json = false;
  let maxRanges;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--file') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--file requires a path value.');
      }
      files.push(value);
      index += 1;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--max-ranges') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--max-ranges requires a positive integer.');
      }
      maxRanges = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (command !== 'compare') {
    throw new Error('Expected command: compare');
  }
  if (files.length !== 2) {
    throw new Error('Compare requires exactly two --file arguments.');
  }

  return { files, json, maxRanges };
}

function printTextSummary(result) {
  console.log(`ipaShip compare: ${result.equal ? 'MATCH' : 'DIFFERENT'}`);
  console.log(`Kind: ${result.kind}`);
  console.log(`Left: ${result.left.path}`);
  console.log(`Right: ${result.right.path}`);

  if (result.kind === 'file') {
    console.log(`Left SHA-256: ${result.left.sha256}`);
    console.log(`Right SHA-256: ${result.right.sha256}`);
    console.log(`Differing bytes: ${result.differingBytes}`);
    if (result.differenceRanges.length > 0) {
      console.log('Difference ranges:');
      for (const range of result.differenceRanges) {
        console.log(`  - ${range.start}-${range.end} (${range.length} bytes)`);
      }
      if (result.truncatedRanges) {
        console.log('  - Additional ranges omitted. Increase --max-ranges to include more.');
      }
    }
  } else {
    console.log(`Changed files: ${result.changes.length}`);
    for (const change of result.changes) {
      console.log(`  - ${change.type}: ${change.path}`);
    }
  }

  console.log(`Knowledge graph: ${result.knowledgeGraph.nodes.length} nodes, ${result.knowledgeGraph.edges.length} edges`);
}

async function main() {
  try {
    const { files, json, maxRanges } = parseArgs(process.argv.slice(2));
    const moduleUrl = pathToFileURL(require.resolve('../src/utils/binary-compare.mjs')).href;
    const { compareArtifacts } = await import(moduleUrl);
    const result = await compareArtifacts(files[0], files[1], { maxRanges });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTextSummary(result);
    }

    process.exitCode = result.equal ? 0 : 1;
  } catch (error) {
    console.error(`ipaship: ${error.message}`);
    printUsage();
    process.exitCode = 2;
  }
}

main();
