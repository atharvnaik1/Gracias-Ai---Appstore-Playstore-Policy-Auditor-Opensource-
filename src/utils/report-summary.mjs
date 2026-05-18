const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const MAX_DASHBOARD_ITEMS = 3;
const MAX_FIX_PLAN_ITEMS = 12;

export function parseReportSummary(reportText) {
  const text = typeof reportText === 'string' ? reportText : '';
  const remediationItems = parseRemediationItems(text);

  const summary = {
    score: parseScore(text),
    verdict: parseVerdict(text),
    severityCounts: parseSeverityCounts(text, remediationItems),
    topBlockers: parseListSection(text, 'Top Blockers', MAX_DASHBOARD_ITEMS),
    quickWins: parseListSection(text, 'Quick Wins', MAX_DASHBOARD_ITEMS),
    policyCategories: parseListSection(text, 'Policy Categories', 6),
    estimatedFixEffort: parseMetric(text, 'Estimated Fix Effort') || null,
    recommendedNextAction: parseMetric(text, 'Recommended Next Action') || '',
    remediationItems,
  };

  if (summary.topBlockers.length === 0) {
    summary.topBlockers = remediationItems
      .filter((item) => item.severity === 'CRITICAL' || item.severity === 'HIGH')
      .slice(0, MAX_DASHBOARD_ITEMS)
      .map((item) => item.issue);
  }

  if (summary.quickWins.length === 0) {
    summary.quickWins = remediationItems
      .filter((item) => item.effort.toLowerCase().startsWith('low') || item.severity === 'LOW')
      .slice(0, MAX_DASHBOARD_ITEMS)
      .map((item) => item.fixDescription || item.issue);
  }

  return summary;
}

export function buildFixPlanMarkdown(summary, reportText) {
  const date = new Date().toISOString().slice(0, 10);
  const source = typeof reportText === 'string' ? reportText : '';
  const safeSummary = summary || parseReportSummary(source);
  const lines = [
    '# ipaShip Fix Plan',
    '',
    `Generated: ${date}`,
    `Readiness score: ${safeSummary.score === null ? 'Pending' : `${safeSummary.score}/100`}`,
    `Verdict: ${safeSummary.verdict === 'UNKNOWN' ? 'Pending' : safeSummary.verdict}`,
  ];

  if (safeSummary.recommendedNextAction) {
    lines.push(`Recommended next action: ${safeSummary.recommendedNextAction}`);
  }

  lines.push('', '## Priority Fixes', '');

  const remediationItems = Array.isArray(safeSummary.remediationItems) ? safeSummary.remediationItems : [];
  if (remediationItems.length > 0) {
    for (const item of remediationItems.slice(0, MAX_FIX_PLAN_ITEMS)) {
      const location = item.files ? ` (${item.files})` : '';
      const fix = item.fixDescription ? ` - ${item.fixDescription}` : '';
      lines.push(`- [ ] **${item.severity || 'ACTION'}** ${item.issue}${location}${fix}`);
    }
  } else {
    const fallbackItems = parseFallbackChecklistItems(source);
    for (const item of fallbackItems.slice(0, MAX_FIX_PLAN_ITEMS)) {
      lines.push(`- [ ] ${item}`);
    }
  }

  if (safeSummary.quickWins?.length) {
    lines.push('', '## Quick Wins', '');
    for (const item of safeSummary.quickWins) {
      lines.push(`- [ ] ${item}`);
    }
  }

  if (safeSummary.policyCategories?.length) {
    lines.push('', '## Policy Categories', '');
    for (const item of safeSummary.policyCategories) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function parseScore(text) {
  const metricScore = parseMetric(text, 'Readiness Score') || parseMetric(text, 'Score');
  const match = metricScore.match(/(\d{1,3})(?:\s*\/\s*100)?/);
  if (!match) return null;
  const score = Number(match[1]);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, score));
}

function parseVerdict(text) {
  const raw = (parseMetric(text, 'Verdict') || '').toUpperCase();
  if (raw.includes('READY WITH CAVEATS')) return 'READY WITH CAVEATS';
  if (raw.includes('NOT READY')) return 'NOT READY';
  if (raw.includes('READY')) return 'READY';
  return 'UNKNOWN';
}

function parseSeverityCounts(text, remediationItems) {
  const counts = {
    critical: parseCountMetric(text, 'Critical Issues'),
    high: parseCountMetric(text, 'High Issues'),
    medium: parseCountMetric(text, 'Medium Issues'),
    low: parseCountMetric(text, 'Low Issues'),
  };

  for (const severity of SEVERITIES) {
    if (counts[severity] === null) {
      const label = severity.toUpperCase();
      counts[severity] = remediationItems.filter((item) => item.severity === label).length;
    }
  }

  return counts;
}

function parseCountMetric(text, label) {
  const metric = parseMetric(text, label);
  const match = metric.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseMetric(text, label) {
  const escaped = escapeRegExp(label);
  const tablePattern = new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*([^|\\n]+)\\s*\\|`, 'i');
  const tableMatch = text.match(tablePattern);
  if (tableMatch) return cleanInline(tableMatch[1]);

  const boldPattern = new RegExp(`\\*\\*${escaped}:\\s*\\*\\*\\s*([^\\n]+)`, 'i');
  const boldMatch = text.match(boldPattern);
  if (boldMatch) return cleanInline(boldMatch[1]);

  const fullyBoldPattern = new RegExp(`\\*\\*${escaped}:\\s*([^*\\n]+)\\*\\*`, 'i');
  const fullyBoldMatch = text.match(fullyBoldPattern);
  if (fullyBoldMatch) return cleanInline(fullyBoldMatch[1]);

  const plainPattern = new RegExp(`^\\s*${escaped}:\\s*([^\\n]+)`, 'im');
  const plainMatch = text.match(plainPattern);
  return plainMatch ? cleanInline(plainMatch[1]) : '';
}

function parseListSection(text, heading, limit) {
  const body = extractHeadingBody(text, heading);
  if (!body) return [];

  return body
    .split('\n')
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1] || '')
    .filter(Boolean)
    .map(cleanInline)
    .slice(0, limit);
}

function extractHeadingBody(text, heading) {
  const headingPattern = new RegExp(`^#{2,4}\\s+${escapeRegExp(heading)}\\s*$`, 'im');
  const match = headingPattern.exec(text);
  if (!match) return '';

  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const nextHeading = rest.search(/\n#{2,4}\s+/);
  const nextRule = rest.search(/\n---/);
  const stops = [nextHeading, nextRule].filter((index) => index >= 0);
  const end = stops.length > 0 ? Math.min(...stops) : rest.length;
  return rest.slice(0, end);
}

function parseRemediationItems(text) {
  const rows = text
    .split('\n')
    .filter((line) => /^\|\s*\d+\s*\|/.test(line));

  return rows
    .map((line) => splitMarkdownTableRow(line))
    .filter((cells) => cells.length >= 6)
    .map((cells) => ({
      issue: cleanInline(cells[1]),
      severity: normalizeSeverity(cells[2]),
      files: cleanInline(cells[3]),
      fixDescription: cleanInline(cells[4]),
      effort: cleanInline(cells[5]),
    }))
    .filter((item) => item.issue);
}

function splitMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseFallbackChecklistItems(text) {
  return text
    .split('\n')
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1] || '')
    .filter(Boolean)
    .map(cleanInline)
    .filter((line) => line.length > 0);
}

function normalizeSeverity(value) {
  const severity = cleanInline(value).toUpperCase();
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity)) return severity;
  return severity || 'ACTION';
}

function cleanInline(value) {
  return String(value || '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
