---
name: ipaship-app-review
description: Use this skill when working with ipaShip app review audits, iOS App Store compliance reports, .ipa review preparation, wrapper usage, or remediation planning for Apple App Store guideline findings.
---

# ipaShip App Review

Use this skill to help users prepare an iOS app for App Store review with ipaShip.

## Primary Workflow

1. Determine whether the user has an existing ipaShip report, an app archive, or only a planned release.
2. If a report exists, summarize the highest-impact findings first and turn them into a short remediation checklist.
3. If an app archive must be audited, guide the user to run the local ipaShip app or one of the wrappers in this repository.
4. For each finding, map it to one of these review areas: safety, performance, business, design, legal and privacy, or technical.
5. Recommend the smallest concrete fix that improves review readiness.
6. End with a release decision: ready, ready after minor fixes, or needs another audit pass.

## Repository Pointers

- Main app: `src/app/page.tsx`
- Audit endpoint: `src/app/api/audit/route.ts`
- Report summary helper: `src/utils/report-summary.mjs`
- Platform wrappers: `wrappers/`
- Android comparison guide: `ANDROID_PLAY_STORE_GUIDE.md`
- Local setup and deployment: `README.md`

## Local Commands

Run the app locally:

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
```

Run the report summary tests:

```bash
node --test src/utils/report-summary.test.mjs
```

## Review Checklist

When reviewing a report, check for:

- Missing privacy disclosures or unclear data collection descriptions.
- Broken onboarding, subscriptions, purchases, or account flows.
- Crashes, slow startup, broken navigation, or blocked core features.
- Misleading copy, placeholder text, or incomplete screenshots.
- Missing support links, contact details, or policy pages.
- Inconsistent app metadata, age rating, category, or review notes.

## Output Format

Prefer concise, action-oriented output:

```markdown
## Decision
Ready after minor fixes.

## Top Fixes
1. Fix ...
2. Add ...
3. Re-test ...

## Notes for Review Submission
- ...
```
