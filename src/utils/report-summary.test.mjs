import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFixPlanMarkdown,
  parseReportSummary,
} from './report-summary.mjs';

const structuredReport = `# Apple App Store Compliance Audit Report

## Review Readiness Summary

| Metric | Value |
|--------|-------|
| Readiness Score | 78/100 |
| Verdict | READY WITH CAVEATS |
| Critical Issues | 1 |
| High Issues | 2 |
| Medium Issues | 3 |
| Low Issues | 4 |
| Estimated Fix Effort | Medium |
| Recommended Next Action | Fix privacy manifest blockers before submission. |

### Top Blockers
- Privacy manifest is missing required data declarations.
- External purchase link appears in onboarding.
- Demo content remains in Settings screen.

### Quick Wins
- Add a privacy policy link.
- Remove placeholder screenshots.
- Rename beta copy in onboarding.
- Add missing support URL.

### Policy Categories
- Legal & Privacy
- Business
- Performance

## Phase 2: Remediation Plan

| # | Issue | Severity | File(s) | Fix Description | Effort |
|---|-------|----------|---------|-----------------|--------|
| 1 | Privacy manifest missing | CRITICAL | \`PrivacyInfo.xcprivacy\` | Declare collected data types | Med |
| 2 | External payment link | HIGH | \`Paywall.swift:42\` | Use IAP for digital goods | High |
`;

test('parseReportSummary extracts readiness metrics and capped lists', () => {
  const summary = parseReportSummary(structuredReport);

  assert.equal(summary.score, 78);
  assert.equal(summary.verdict, 'READY WITH CAVEATS');
  assert.deepEqual(summary.severityCounts, {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  });
  assert.equal(summary.estimatedFixEffort, 'Medium');
  assert.equal(summary.recommendedNextAction, 'Fix privacy manifest blockers before submission.');
  assert.deepEqual(summary.topBlockers, [
    'Privacy manifest is missing required data declarations.',
    'External purchase link appears in onboarding.',
    'Demo content remains in Settings screen.',
  ]);
  assert.deepEqual(summary.quickWins, [
    'Add a privacy policy link.',
    'Remove placeholder screenshots.',
    'Rename beta copy in onboarding.',
  ]);
  assert.deepEqual(summary.policyCategories, ['Legal & Privacy', 'Business', 'Performance']);
});

test('parseReportSummary falls back to existing score and remediation table', () => {
  const summary = parseReportSummary(`## Phase 2: Remediation Plan

| # | Issue | Severity | File(s) | Fix Description | Effort |
|---|-------|----------|---------|-----------------|--------|
| 1 | ATT prompt missing | HIGH | \`App.swift:12\` | Add tracking prompt | Med |
| 2 | Privacy URL absent | MEDIUM | \`Info.plist\` | Add URL | Low |

## Submission Readiness

**Score: 64/100**
**Verdict: NOT READY**`);

  assert.equal(summary.score, 64);
  assert.equal(summary.verdict, 'NOT READY');
  assert.equal(summary.severityCounts.high, 1);
  assert.equal(summary.severityCounts.medium, 1);
  assert.deepEqual(summary.topBlockers, ['ATT prompt missing']);
  assert.deepEqual(summary.quickWins, ['Add URL']);
});

test('parseReportSummary handles malformed reports without throwing', () => {
  const summary = parseReportSummary('This is plain text with no structured readiness section.');

  assert.equal(summary.score, null);
  assert.equal(summary.verdict, 'UNKNOWN');
  assert.deepEqual(summary.severityCounts, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  });
  assert.deepEqual(summary.topBlockers, []);
  assert.deepEqual(summary.quickWins, []);
});

test('buildFixPlanMarkdown exports structured and fallback checklists', () => {
  const structured = parseReportSummary(structuredReport);
  const structuredMarkdown = buildFixPlanMarkdown(structured, structuredReport);

  assert.match(structuredMarkdown, /# ipaShip Fix Plan/);
  assert.match(structuredMarkdown, /Readiness score: 78\/100/);
  assert.match(structuredMarkdown, /- \[ \] \*\*CRITICAL\*\* Privacy manifest missing/);
  assert.match(structuredMarkdown, /- \[ \] Add a privacy policy link\./);

  const fallbackMarkdown = buildFixPlanMarkdown(
    parseReportSummary('## Issues\n- Fix privacy URL\n- Remove beta text'),
    '## Issues\n- Fix privacy URL\n- Remove beta text',
  );

  assert.match(fallbackMarkdown, /- \[ \] Fix privacy URL/);
  assert.match(fallbackMarkdown, /- \[ \] Remove beta text/);
});
