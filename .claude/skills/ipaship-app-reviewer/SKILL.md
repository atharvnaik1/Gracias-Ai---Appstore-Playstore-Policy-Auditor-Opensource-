---
name: ipaship-app-reviewer
description: Review iOS IPA, Android APK, or source ZIP artifacts for App Store or Google Play compliance with ipaShip. Use when the user asks to audit a mobile app package, interpret an ipaShip report, prepare remediation steps, or run the ipaShip app locally.
---

# ipaShip App Reviewer

Use ipaShip to audit mobile app packages against App Store Review Guidelines or Google Play policies, then turn the report into concrete remediation work.

## Inputs

Ask for any missing required input before starting:

- App artifact: `.ipa`, `.apk`, or source `.zip`.
- Target store: Apple App Store for `.ipa`, Google Play for `.apk`, or ask if unclear.
- AI provider and model if the user has a preference.
- API key only when needed. Treat provider keys as secrets and never write them into committed files, logs, or examples.

## Preferred Workflow

1. Confirm the user is allowed to upload or inspect the app artifact, especially for proprietary apps.
2. Run ipaShip locally when the user wants privacy or repeatability:
   ```bash
   npm install
   echo "MONGODB_URI=your_mongodb_uri_here" > .env.local
   npm run dev
   ```
3. Open the local app, upload the artifact, choose the provider/model, and add any context the user supplied.
4. Wait for the streaming report to complete before drawing conclusions.
5. Export the report as Markdown when the user wants a durable artifact.
6. Summarize findings by severity, then create a prioritized fix list with file-level follow-up steps when source code is available.

## Hosted Workflow

Use `https://ipaship.com` only when the user approves uploading the artifact to the hosted service. Tell the user that API keys and app packages may be sensitive, and prefer local execution when they are unsure.

## Report Review Checklist

When interpreting an ipaShip report:

- Separate policy risk, implementation bugs, privacy issues, entitlement problems, and UX rejection risks.
- Highlight blocking App Review or Play Console risks first.
- Mark findings as confirmed, likely, or needs manual verification.
- Avoid generic advice; connect each recommendation to the provided code, metadata, entitlement, privacy manifest, or app behavior.
- If the report is weak or speculative, ask for source ZIP, screenshots, privacy labels, entitlement files, or release notes to tighten the review.

## Implementation Follow-Up

When the user asks for fixes:

- Inspect the source files before editing.
- Preserve platform conventions such as `Info.plist`, entitlements, privacy manifests, Android manifests, and store listing metadata.
- Add focused tests or validation steps when possible.
- Re-run ipaShip after changes when the user provides the artifact or a rebuild path.

## Safety Boundaries

- Do not upload private apps, keys, provisioning profiles, or store credentials without explicit user approval.
- Do not claim the app is compliant solely because the report passes; App Review and Play review remain external decisions.
- Do not store or commit generated reports if they contain secrets, unreleased product details, or customer data unless the user asks.
