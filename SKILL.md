---
name: ipaship-app-review
description: Review mobile/web apps against OWASP and industry guidelines using ipaship
---

## ipaship App Review Skill

Analyze mobile or web application source code and generate a structured security/privacy review report.

### Usage

```
/ipaship-review <path-to-app-source>
```

### What it checks

- **Data Security**: hardcoded secrets, insecure storage, unencrypted traffic
- **Privacy**: excessive permissions, data collection, third-party SDK tracking
- **Code Quality**: error handling, input validation, dependency vulnerabilities
- **Compliance**: GDPR, CCPA, OWASP MASVS, Play Store/App Store guidelines

### Workflow

1. Read the app source code from the provided directory
2. Check for known vulnerability patterns across all files
3. Generate a structured report with severity ratings
4. Output findings in GitHub-issue-ready Markdown format

### Report Format

Each finding includes:
- **Severity**: Critical / High / Medium / Low / Info
- **Location**: File and line number
- **Description**: What the issue is
- **Impact**: Why it matters
- **Fix**: How to remediate

### Example

```
/ipaship-review ./my-app

### Report: my-app

| Finding | Severity | Location |
|---------|----------|----------|
| Hardcoded API key | High | src/api/client.ts:15 |
| Missing CSP header | Medium | next.config.mjs:42 |
| Logged user data | Low | src/utils/analytics.ts:88 |
```

### Requirements

- Node.js 18+ and npm packages installed (`npm install`)
- App source available in a local directory
