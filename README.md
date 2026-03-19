# Auditi Report AI - Open Source

This repository contains the standalone open source AI auditor for analyzing iOS and Android applications to ensure App Store & Play Store Policy compliance.

It is an API route designed for Next.js that accepts `.zip` or `.ipa` uploads of application code bases, processes them locally by extracting and reading relevant source files, and streams the context over to Claude 3.5 Sonnet to generate an intelligent compliance report.

## Setup

1. Clone this repository or copy the code to your project.
2. Install the required dependencies:
   \`\`\`bash
   npm install next react react-dom busboy
   npm install -D @types/busboy
   \`\`\`
3. Use this file as a \`route.ts\` within your Next.js application (e.g., \`src/app/api/audit/route.ts\`).

## Usage

Send a POST request to this endpoint containing:
- \`file\`: The \`.zip\` or \`.ipa\` archive of your source code.
- \`claudeApiKey\`: Your Anthropic API key to process the audit.
- \`context\`: (Optional) Any specific things you'd like Claude to keep in mind.

It will stream back a markdown-formatted Compliance Audit Report.

## Open Source
Feel free to use and contribute!
