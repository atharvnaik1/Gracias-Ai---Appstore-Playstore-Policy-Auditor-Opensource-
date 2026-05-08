export type ReadinessVerdict = 'READY' | 'NOT READY' | 'READY WITH CAVEATS' | 'UNKNOWN';

export type RemediationItem = {
  issue: string;
  severity: string;
  files: string;
  fixDescription: string;
  effort: string;
};

export type ReportSummary = {
  score: number | null;
  verdict: ReadinessVerdict;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  topBlockers: string[];
  quickWins: string[];
  policyCategories: string[];
  estimatedFixEffort: string | null;
  recommendedNextAction: string;
  remediationItems: RemediationItem[];
};

export function parseReportSummary(reportText: string): ReportSummary;
export function buildFixPlanMarkdown(summary: ReportSummary, reportText: string): string;
