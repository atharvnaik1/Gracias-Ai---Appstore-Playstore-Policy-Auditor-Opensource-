---
name: ipaship-audit
description: Audit an iOS .ipa or Android .apk against App Store / Google Play guidelines before submission. Extracts and analyzes source code for compliance issues.
tags: [ios, android, app-store, compliance, audit, review]
---

# ipaShip App Store Compliance Auditor

AI-powered compliance audit for mobile apps. Drops into any Claude Code project to review `.ipa` or `.apk` files against Apple App Store Review Guidelines or Google Play Developer Program Policies — before submission.

## Quick Start

### Prerequisites
- Claude Code with access to file system tools (read, execute)
- `unzip` installed on the system
- An extracted `.ipa` or `.apk` (or the raw binary for Claude to extract)

### Basic Audit
```
Audit this iOS app for App Store compliance:
1. Extract: unzip MyApp.ipa -d /tmp/audit_app
2. Read: Info.plist from the extracted bundle
3. Scan all source files under /tmp/audit_app/Payload/*.app/
4. Check against ALL 6 Apple Review Guideline categories
5. Produce a markdown audit report with FAIL/WARN/PASS status per category
```

### With API key (uses the live ipaship.com service)
```
# Set the env var first
export IPASHIP_API_KEY="sk-your-key-here"

# Then in Claude Code:
Run an ipaShip audit on MyApp.ipa using the API.
If API key is set, POST to https://ipaship.com/api/audit with multipart file upload.
```

## Audit Checklist Template

When auditing manually, check these categories:

### 1. Safety (Guideline 1.x)
- [ ] No objectionable content
- [ ] User-generated content has filtering/reporting
- [ ] No realistic violence without context

### 2. Performance (Guideline 2.x)
- [ ] App completes stated functionality (2.1)
- [ ] No placeholder/garbage UI (4.2 Minimum Functionality)
- [ ] Beta/demo features clearly labeled (2.9)

### 3. Business (Guideline 3.x)
- [ ] In-app purchases use StoreKit (3.1.1)
- [ ] No external payment links or references
- [ ] Subscriptions properly configured
- [ ] No "loot box" without odds disclosure

### 4. Design (Guideline 4.x)
- [ ] Follows HIG (Human Interface Guidelines)
- [ ] App icon and launch screen present
- [ ] No Apple trademarks misused
- [ ] Minimum iOS version declared

### 5. Legal & Privacy (Guideline 5.x)
- [ ] Privacy policy URL present and accessible
- [ ] App Tracking Transparency (ATT) implemented if tracking
- [ ] Privacy nutrition labels match actual data collection
- [ ] Data collection consent implemented
- [ ] No hidden data collection

### 6. Technical
- [ ] No private API usage
- [ ] Entitlements match declared capabilities
- [ ] Background modes justified
- [ ] No deprecated API calls

## Finding Format

Every finding must include:
```markdown
| STATUS | Guideline | Finding | File(s) | Action |
|--------|-----------|---------|---------|--------|
| FAIL | 5.1.1 | No privacy policy URL in Info.plist | Info.plist | Add NSPrivacyPolicyURL key |
| WARN | 2.1 | Empty view controller stubs found | ViewController.swift:45 | Implement placeholder UI |
| PASS | 3.1.1 | StoreKit imports confirmed | AppDelegate.swift:3 | N/A |
```

## Extract Commands

```bash
# iOS .ipa (it's just a zip)
unzip -q MyApp.ipa -d /tmp/ipa_audit/
# Find the .app bundle
APP=$(find /tmp/ipa_audit/Payload -name "*.app" -type d | head -1)
# Read Info.plist
plutil -p "$APP/Info.plist" 2>/dev/null || cat "$APP/Info.plist"
# Scan all Swift/ObjC files
find "$APP" -name "*.swift" -o -name "*.m" -o -name "*.mm" | head -20
# Check for strings (URLs, APIs, tracking)
strings "$APP/$(basename $APP .app)" | grep -iE 'http|https|track|advert|facebook|google' | sort -u
```

```bash
# Android .apk (it's just a zip)
unzip -q MyApp.apk -d /tmp/apk_audit/
# Read manifest
cat /tmp/apk_audit/AndroidManifest.xml 2>/dev/null || xmlstarlet fo AndroidManifest.xml
# Scan dex for suspicious strings
strings /tmp/apk_audit/classes.dex | grep -iE 'http|payment|ad|tracker|analytics' | sort -u | head -50
```

## Severity Guide

| Level | Meaning | Example |
|-------|---------|---------|
| CRITICAL | Guaranteed rejection | Missing privacy policy, hidden external payment |
| HIGH | Very likely rejection | Missing ATT, broken entitlements, placeholder UI |
| MEDIUM | Reviewer may flag | Deprecated APIs, non-standard UI patterns |
| LOW | Best practice | Minor HIG violations, code quality |

## Integration with CI/CD

```yaml
# GitHub Actions workflow
name: App Store Compliance Audit
on: [pull_request]
jobs:
  audit:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build IPA
        run: xcodebuild -scheme MyApp -archivePath MyApp archive && xcodebuild -exportArchive -archivePath MyApp.xcarchive -exportPath . -exportOptionsPlist ExportOptions.plist
      - name: Claude Audit
        run: claude "Audit MyApp.ipa for App Store compliance using the ipaship-audit skill. Report FAIL/WARN/PASS per guideline category. Exit 1 if any CRITICAL findings."
```
