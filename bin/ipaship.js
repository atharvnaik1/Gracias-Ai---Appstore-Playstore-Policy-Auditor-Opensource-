#!/usr/bin/env node

const {comparePaths} = require('../src/utils/binary-compare');

function printHelp() {
  console.log(`Usage:
  ipaship compare --file <path1> --file <path2> [--json]

Commands:
  compare   Compare two files or directories and report added, removed, and changed files.

Options:
  --file    File or directory to compare. Pass exactly two.
  --json    Print the full comparison result as JSON.
  --help    Show this help message.`);
}

function parseArgs(argv) {
  const args = {files: [], json: false, command: argv[2]};

  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--file') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--file requires a path');
      }
      args.files.push(value);
      index += 1;
      continue;
    }

    if (arg === '--json') {
      args.json = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printTextResult(result) {
  const {summary} = result;
  console.log(`Compared ${result.left.path} -> ${result.right.path}`);
  console.log(`Added: ${summary.added}, removed: ${summary.removed}, changed: ${summary.changed}, unchanged: ${summary.unchanged}`);

  for (const file of result.added) {
    console.log(`+ ${file.path} (${file.size} bytes, ${file.sha256})`);
  }

  for (const file of result.removed) {
    console.log(`- ${file.path} (${file.size} bytes, ${file.sha256})`);
  }

  for (const file of result.changed) {
    console.log(`~ ${file.path} (${file.before.size} -> ${file.after.size} bytes)`);
    console.log(`  before: ${file.before.sha256}`);
    console.log(`  after:  ${file.after.sha256}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.command) {
    printHelp();
    return;
  }

  if (args.command !== 'compare') {
    throw new Error(`Unknown command: ${args.command}`);
  }

  if (args.files.length !== 2) {
    throw new Error('compare requires exactly two --file paths');
  }

  const result = await comparePaths(args.files[0], args.files[1]);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printTextResult(result);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
